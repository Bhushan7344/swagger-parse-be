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
      
      // Get request body and field info
      let requestBody = null;
      let requestFieldInfo = null;
      
      if (endpoint.requestBody) {
        try {
          const content = endpoint.requestBody.content || {};
          const jsonContent = content['application/json'] || Object.values(content)[0];
          
          if (jsonContent && jsonContent.schema) {
            const schema = jsonContent.schema;
            const result = createSchemaBasedRequestBody(schema, swaggerData.definitions);
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
        full_path: `${baseUrl}${createPathWithParams(endpoint.path, endpoint.parameters)}`,
        summary: endpoint.summary || "",
        request_body: requestBody,
        request_field_info: requestFieldInfo ? JSON.stringify(requestFieldInfo) : null,
        request_headers: JSON.stringify({
          "Content-Type": "application/json",
          Authorization: "Bearer dummy_token",
        }),
      };

      const savedEndpoint = await databaseService.saveApiEndpoint({
        ...processedEndpoint,
        user_id: userId,
        load_status: true,
        total_requests: total_requests,
        threads: threads
      });

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
    
    // Create dummy data and field info based on schema
    const result = createSchemaBasedRequestBody(schema, definitions);
    return JSON.stringify(result.dummyData);
  } catch (error) {
    console.error("Error creating dummy request body:", error);
    return JSON.stringify({ dummy_data: "value" });
  }
}

/**
  * Process schema to extract both dummy data and field metadata
 */
function createSchemaBasedRequestBody(schema, definitions = {}) {
  // Extract the schema fields and create dummy data
  const { dummyData, fieldInfo } = createDummyDataFromSchema(schema, definitions);
  
  return { 
    dummyData,
    fieldInfo
  };
}

/**
 * Recursively create dummy data from schema while tracking required/optional fields
 */
function createDummyDataFromSchema(schema, definitions = {}, visited = new Set(), path = '') {
  // Handle reference to another schema
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    
    // Prevent infinite recursion
    if (visited.has(refName)) {
      return { 
        dummyData: { dummy_reference: refName },
        fieldInfo: { type: 'reference', required: false, path: path }
      };
    }
    
    visited.add(refName);
    const refSchema = definitions[refName];
    
    if (refSchema) {
      const result = createDummyDataFromSchema(refSchema, definitions, visited, path);
      result.fieldInfo.referenceName = refName;
      return result;
    }
    
    return { 
      dummyData: { dummy_reference: refName },
      fieldInfo: { type: 'reference', referenceName: refName, required: false, path: path }
    };
  }
  
  // Handle different schema types
  switch (schema.type) {
    case 'object': {
      const properties = schema.properties || {};
      const required = schema.required || [];
      const dummyData = {};
      const fieldInfo = {
        type: 'object',
        required: false,
        path: path,
        properties: {}
      };
      
      for (const [key, propSchema] of Object.entries(properties)) {
        const isRequired = required.includes(key);
        const newPath = path ? `${path}.${key}` : key;
        const result = createDummyDataFromSchema(propSchema, definitions, visited, newPath);
        
        dummyData[key] = result.dummyData;
        fieldInfo.properties[key] = {
          ...result.fieldInfo,
          required: isRequired
        };
      }
      
      return { dummyData, fieldInfo };
    }
      
    case 'array': {
      let itemResult = { dummyData: "dummy_array_item", fieldInfo: { type: 'unknown' } };
      
      if (schema.items) {
        // Just get the structure of a single item
        itemResult = createDummyDataFromSchema(
          schema.items, 
          definitions, 
          visited, 
          path ? `${path}[]` : '[]'
        );
      }
      
      return { 
        dummyData: [itemResult.dummyData],
        fieldInfo: { 
          type: 'array',
          required: false,
          path: path,
          items: itemResult.fieldInfo
        }
      };
    }
      
    case 'string': {
      let value = "dummy_string";
      if (schema.format === 'date-time') value = new Date().toISOString();
      else if (schema.format === 'date') value = new Date().toISOString().split('T')[0];
      else if (schema.format === 'email') value = "user@example.com";
      else if (schema.format === 'uuid') value = "00000000-0000-0000-0000-000000000000";
      else if (schema.enum && schema.enum.length > 0) value = schema.enum[0];
      
      return { 
        dummyData: value,
        fieldInfo: { 
          type: 'string',
          format: schema.format || 'text',
          enum: schema.enum,
          required: false,
          path: path
        }
      };
    }
      
    case 'integer':
    case 'number':
      return { 
        dummyData: 0,
        fieldInfo: { 
          type: schema.type,
          format: schema.format,
          minimum: schema.minimum,
          maximum: schema.maximum,
          required: false,
          path: path
        }
      };
      
    case 'boolean':
      return { 
        dummyData: false,
        fieldInfo: { 
          type: 'boolean',
          required: false,
          path: path
        }
      };
      
    default:
      return { 
        dummyData: "dummy_value",
        fieldInfo: { 
          type: schema.type || 'unknown',
          required: false,
          path: path
        }
      };
  }
}

// Export as a simple object for use like a service
export const swaggerService = {
  getSwaggerData,
  processSwaggerData,
};

