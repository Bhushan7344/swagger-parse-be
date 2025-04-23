import axios from "axios";
import { databaseService } from "./databaseService.js";
import {
  extractBaseUrl,
  createPathWithParams,
  createSchemaBasedRequestBody,
} from "../utils/swaggerUtils.js";

/**
 * Fetches swagger documentation from a URL and parses it
 */
async function getSwaggerData(swaggerUrl) {
  try {
    const { data } = await axios.get(swaggerUrl);
    const paths = data.paths || {};
    const definitions = data.definitions || data.components?.schemas || {};
    const security = data.security || [];
    const securitySchemes =
      data.components?.securitySchemes || data.securityDefinitions || {};
    const endpoints = Object.entries(paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, details]) => ({
        method: method.toUpperCase(),
        path,
        summary: details.summary || details.description || "",
        tags: details.tags || [],
        parameters: details.parameters || [],
        requestBody: details.requestBody || null,
      }))
    );

    return {
      info: data.info || {},
      servers: data.servers || [],
      endpoints,
      paths,
      definitions,
      security,
      securitySchemes,
    };
  } catch (error) {
    console.error("Error fetching swagger data:", error);
    throw new Error("Failed to fetch or parse Swagger data");
  }
}

/**
 * Process the swagger data and save to database
 */
async function processSwaggerData(swaggerUrl, userId, total_requests, threads, selectedIds = [], token) {
  try {
    const swaggerData = await getSwaggerData(swaggerUrl);
    const baseUrl = extractBaseUrl(swaggerUrl);
    const processedEndpoints = [];

    // Add ID to each endpoint
    let idCounter = 1;
    const endpointsWithIds = swaggerData.endpoints.map((endpoint) => ({
      ...endpoint,
      id: idCounter++,
    }));

    // Determine which endpoints to process
    const endpointsToProcess =
      selectedIds.length === 0
        ? endpointsWithIds
        : endpointsWithIds.filter((ep) => selectedIds.includes(ep.id));

    // Determine auth type
    let authHeaderKey = 'Authorization';
    let authHeaderValue = '';
    
    const securityRequirements = swaggerData.security || [];
    const securitySchemes = swaggerData.securitySchemes || {};

    if (token && securityRequirements.length > 0) {
      const firstRequirement = securityRequirements[0];
      const securitySchemeName = Object.keys(firstRequirement)[0];
      const securityScheme = securitySchemes[securitySchemeName];
    
      if (securityScheme) {
        switch (securityScheme.type) {
          case 'http':
            if (securityScheme.scheme === 'basic') {
              authHeaderValue = `Basic ${token}`;
            } else if (securityScheme.scheme === 'bearer') {
              authHeaderValue = `Bearer ${token}`;
            }
            break;
          case 'apiKey':
            if (securityScheme.in === 'header') {
              authHeaderKey = securityScheme.name;
              authHeaderValue = token;
            }
            break;
          default:
            console.warn("Unknown auth scheme type; using Bearer fallback.");
            authHeaderValue = `Bearer ${token}`;
        }
      } else {
        console.warn(`Security scheme '${securitySchemeName}' not found.`);
      }
    }

    for (const endpoint of endpointsToProcess) {
      const pathDetails = swaggerData.paths?.[endpoint.path];

      let requestBody = null;
      let requestFieldInfo = null;

      if (endpoint.requestBody) {
        try {
          const content = endpoint.requestBody.content || {};
          const jsonContent =
            content["application/json"] || Object.values(content)[0];

          if (jsonContent && jsonContent.schema) {
            const schema = jsonContent.schema;
            const result = createSchemaBasedRequestBody(
              schema,
              swaggerData.definitions
            );
            requestBody = JSON.stringify(result.dummyData);
            requestFieldInfo = result.fieldInfo;
          }
        } catch (error) {
          console.error("Error processing request body schema:", error);
          requestBody = null;
          requestFieldInfo = null;
        }
      }

      // Process the endpoint
      const processedEndpoint = {
        method: endpoint.method,
        full_path: `${baseUrl}${createPathWithParams(
          endpoint.path,
          endpoint.parameters
        )}`,
        summary: endpoint.summary || "",
        request_body: requestBody,
        request_field_info: requestFieldInfo
          ? JSON.stringify(requestFieldInfo)
          : null,
        request_headers: JSON.stringify({
          "Content-Type": "application/json",
          ...(token && authHeaderValue ? { [authHeaderKey]: authHeaderValue } : {}),
        }),
      };

      const savedEndpoint = await databaseService.saveApiEndpoint({
        ...processedEndpoint,
        user_id: userId,
        total_requests: total_requests,
        threads: threads,
      });

      // const savedEndpoint = {
      //   ...processedEndpoint,
      //   user_id: userId,
      //   load_status: true,
      //   total_requests: total_requests,
      //   threads: threads,
      // };

      processedEndpoints.push(savedEndpoint);
    }

    return {
      swaggerInfo: swaggerData.info,
      endpointsProcessed: processedEndpoints.length,
      endpoints: processedEndpoints,
    };
  } catch (error) {
    console.error("Error processing swagger data:", error);
    throw new Error("Failed to process Swagger data");
  }
}

async function extractRequestBodyTemplates(swaggerUrl, selectedIds = []) {
  try {
    const swaggerData = await getSwaggerData(swaggerUrl);
    const baseUrl = extractBaseUrl(swaggerUrl);

    let idCounter = 1;
    const endpointsWithIds = swaggerData.endpoints.map((endpoint) => ({
      ...endpoint,
      id: idCounter++,
    }));

    const endpointsToProcess =
      selectedIds.length === 0
        ? endpointsWithIds
        : endpointsWithIds.filter((ep) => selectedIds.includes(ep.id));

    const resultTemplates = [];

    for (const endpoint of endpointsToProcess) {
      let requestBody = null;
      let requestFieldInfo = null;

      if (endpoint.requestBody) {
        try {
          const content = endpoint.requestBody.content || {};
          const jsonContent =
            content["application/json"] || Object.values(content)[0];

          if (jsonContent?.schema) {
            const schema = jsonContent.schema;
            const result = createSchemaBasedRequestBody(
              schema,
              swaggerData.definitions
            );
            requestBody = result.dummyData;
            requestFieldInfo = result.fieldInfo;
          }
        } catch (err) {
          console.warn(`Failed to extract request body for ${endpoint.path}`, err);
        }
      }

      resultTemplates.push({
        method: endpoint.method.toUpperCase(),
        api_url: `${baseUrl}${createPathWithParams(endpoint.path, endpoint.parameters)}`,
        request_body_template: requestBody,
        request_fields_info: requestFieldInfo,
      });
    }

    return resultTemplates;
  } catch (error) {
    console.error("Error extracting request body templates:", error);
    throw new Error("Failed to extract request body templates");
  }
}



async function getSwaggerEndpointPaths(swaggerUrl) {
  try {
    const swaggerData = await getSwaggerData(swaggerUrl);
    const baseUrl = extractBaseUrl(swaggerUrl);
    const endpointsInfo = [];

    let idCounter = 1;
    for (const endpoint of swaggerData.endpoints) {
      const fullPath = createPathWithParams(endpoint.path, endpoint.parameters);
      
      const method = endpoint.method || ['GET']; // Default to GET if not provided
        endpointsInfo.push({
          id: idCounter++,
          method: method.toUpperCase(),
          path: fullPath
        });
    }

    return endpointsInfo;
  } catch (error) {
    console.error("Error extracting endpoint paths:", error);
    throw new Error("Failed to extract endpoint paths from Swagger");
  }
}


// Export as a simple object for use like a service
export const swaggerService = {
  getSwaggerData,
  processSwaggerData,
  getSwaggerEndpointPaths,
  extractRequestBodyTemplates
};