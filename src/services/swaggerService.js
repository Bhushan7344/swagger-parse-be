import axios from "axios";
import { databaseService } from "./databaseService.js";

/**
 * Fetches swagger documentation from a URL and parses it
 */
async function getSwaggerData(swaggerUrl) {
  try {
    const { data } = await axios.get(swaggerUrl);

    const paths = data.paths || {};
    const definitions = data.definitions || data.components?.schemas || {};

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
      definitions
    };
  } catch (error) {
    console.error("Error fetching swagger data:", error);
    throw new Error("Failed to fetch or parse Swagger data");
  }
}

/**
 * Process an endpoint without using Gemini
 */
function processEndpoint(request) {
  const { endpoint } = request;
  return createDefaultResponse(endpoint);
}

/**
 * Create a default response for an endpoint
 */
function createDefaultResponse(endpoint) {
  return {
    method: endpoint.method,
    full_path: createPathWithDummyParams(endpoint.path),
    summary: endpoint.summary || "",
    request_body: createDummyRequestBody(endpoint),
    request_headers: JSON.stringify({
      "Content-Type": "application/json",
      Authorization: "Bearer dummy_token",
    }),
  };
}

/**
 * Process the swagger data and save to database
 */
async function processSwaggerData(swaggerUrl, userId, total_requests, threads) {
  try {
    const swaggerData = await getSwaggerData(swaggerUrl);
    const baseUrl = extractBaseUrl(swaggerUrl);
    const processedEndpoints = [];

    for (const endpoint of swaggerData.endpoints) {
      const pathDetails = swaggerData.paths?.[endpoint.path];
      
      // Process the endpoint
      const processedEndpoint = {
        method: endpoint.method,
        full_path: `${baseUrl}${createPathWithParams(endpoint.path, endpoint.parameters)}`,
        summary: endpoint.summary || "",
        request_body: createDummyRequestBody(endpoint, swaggerData.definitions),
        request_headers: JSON.stringify({
          "Content-Type": "application/json",
          Authorization: "Bearer dummy_token",
        }),
      };

      // const savedEndpoint = await databaseService.saveApiEndpoint({
      //   ...processedEndpoint,
      //   user_id: userId,
      //   load_status: true,
      //   total_requests: total_requests,
      //   threads: threads
      // });

      const savedEndpoint = {
        ...processedEndpoint,
        user_id: userId,
        load_status: true,
        total_requests: total_requests,
        threads: threads
      };

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

function extractBaseUrl(swaggerUrl) {
  try {
    const url = new URL(swaggerUrl);
    // Remove /v3/api-docs or similar endpoints to get the base API URL
    const pathSegments = url.pathname.split('/');
    const apiDocsIndex = pathSegments.findIndex(segment => 
      segment.includes('api-docs') || segment.includes('swagger'));
    
    if (apiDocsIndex !== -1) {
      // Remove API docs segments from the path
      const basePath = pathSegments.slice(0, apiDocsIndex).join('/');
      return `${url.protocol}//${url.host}${basePath}`;
    }
    
    // If we can't identify API docs pattern, just return up to the host
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    console.error("Error extracting base URL:", error);
    return "";
  }
}

function createPathWithParams(path, parameters = []) {
  // Handle path parameters
  let fullPath = path.replace(
    /{([^}]+)}/g,
    (_, param) => `dummy_${param}`
  );
  
  // Add query parameters if they exist
  const queryParams = parameters.filter(param => param.in === 'query');
  
  if (queryParams.length > 0) {
    fullPath += '?';
    fullPath += queryParams.map(param => 
      `${param.name}=dummy_value`
    ).join('&');
  }
  
  return fullPath;
}


/**
 * Create a request body based on endpoint details with correct schema keys
 */
function createDummyRequestBody(endpoint, definitions = {}) {
  if (!endpoint.requestBody) {
    return null;
  }

  try {
    // Get the request body content
    const content = endpoint.requestBody.content || {};
    const jsonContent = content['application/json'] || Object.values(content)[0];
    
    if (!jsonContent || !jsonContent.schema) {
      return JSON.stringify({ dummy_data: "value" });
    }
    
    // Extract schema
    const schema = jsonContent.schema;
    
    // Create dummy data based on schema
    const dummyData = createDummyDataFromSchema(schema, definitions);
    return JSON.stringify(dummyData);
  } catch (error) {
    console.error("Error creating dummy request body:", error);
    return JSON.stringify({ dummy_data: "value" });
  }
}

/**
 * Recursively create dummy data from schema
 */
function createDummyDataFromSchema(schema, definitions = {}, visited = new Set()) {
  // Handle reference to another schema
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    
    // Prevent infinite recursion
    if (visited.has(refName)) {
      return { dummy_reference: refName };
    }
    
    visited.add(refName);
    const refSchema = definitions[refName];
    
    if (refSchema) {
      return createDummyDataFromSchema(refSchema, definitions, visited);
    }
    return { dummy_reference: refName };
  }
  
  // Handle different schema types
  switch (schema.type) {
    case 'object':
      const properties = schema.properties || {};
      const result = {};
      
      for (const [key, propSchema] of Object.entries(properties)) {
        result[key] = createDummyDataFromSchema(propSchema, definitions, visited);
      }
      
      return result;
      
    case 'array':
      if (schema.items) {
        // Just return a single item array for simplicity
        return [createDummyDataFromSchema(schema.items, definitions, visited)];
      }
      return ["dummy_array_item"];
      
    case 'string':
      return schema.format === 'date-time' ? new Date().toISOString() :
        schema.format === 'date' ? new Date().toISOString().split('T')[0] :
        schema.format === 'email' ? "user@example.com" :
        schema.format === 'uuid' ? "00000000-0000-0000-0000-000000000000" :
        schema.enum ? schema.enum[0] : "dummy_string";
      
    case 'integer':
    case 'number':
      return 0;
      
    case 'boolean':
      return false;
      
    default:
      return "dummy_value";
  }
}

// Export as a simple object for use like a service
export const swaggerService = {
  getSwaggerData,
  processSwaggerData,
};