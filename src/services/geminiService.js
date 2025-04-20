import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("GEMINI_API_KEY is not defined in environment variables");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

/**
 * Process an API endpoint with Gemini
 */
async function processEndpoint(request) {
  try {
    const { endpoint, pathDetails, definitions } = request;

    const prompt = createPrompt(endpoint, pathDetails, definitions);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return parseGeminiResponse(text, endpoint);
  } catch (error) {
    console.error("Error processing with Gemini:", error);
    return createDefaultResponse(request.endpoint);
  }
}

/**
 * Create a prompt for Gemini
 */
function createPrompt(endpoint, pathDetails, definitions) {
  return `
    Given the following API endpoint details from a Swagger/OpenAPI specification, 
    please extract and structure the information according to the specified format:
    
    API Path: ${endpoint.path}
    HTTP Method: ${endpoint.method}
    Summary: ${endpoint.summary || "No summary provided"}
    
    Parameters: ${JSON.stringify(endpoint.parameters || [])}
    Request Body: ${JSON.stringify(endpoint.requestBody || {})}
    
    Please format the response as the following JSON structure:
    {
      "method": "HTTP_METHOD",
      "full_path": "COMPLETE_PATH_WITH_DUMMY_QUERY_PARAMS",
      "summary": "API_DESCRIPTION",
      "request_body": "JSON_STRING_OR_NULL",
      "request_headers": "JSON_STRING_OR_NULL"
    }
    
    For query parameters in the path, please include dummy values.
    For request headers, include common headers like Content-Type, Authorization, etc. as appropriate.
    For request body, convert it to a stringified JSON if it exists.
  `;
}

/**
 * Parse the response from Gemini
 */
function parseGeminiResponse(response, endpoint) {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsedData = JSON.parse(jsonMatch[0]);
      return {
        method: parsedData.method || endpoint.method,
        full_path:
          parsedData.full_path || createPathWithDummyParams(endpoint.path),
        summary: parsedData.summary || endpoint.summary || "",
        request_body: parsedData.request_body || null,
        request_headers: parsedData.request_headers || null,
      };
    }

    return createDefaultResponse(endpoint);
  } catch (error) {
    console.error("Error parsing Gemini response:", error);
    return createDefaultResponse(endpoint);
  }
}

/**
 * Create a default response if Gemini fails
 */
function createDefaultResponse(endpoint) {
  return {
    method: endpoint.method,
    full_path: createPathWithDummyParams(endpoint.path),
    summary: endpoint.summary || "",
    request_body: null,
    request_headers: JSON.stringify({
      "Content-Type": "application/json",
      Authorization: "Bearer dummy_token",
    }),
  };
}

/**
 * Create a path with dummy parameters
 */
function createPathWithDummyParams(path) {
  const pathWithPathParams = path.replace(
    /{([^}]+)}/g,
    (_, param) => `dummy_${param}`
  );

  if (path.includes("{")) {
    return `${pathWithPathParams}?dummy_param=value`;
  }

  return pathWithPathParams;
}

export const geminiService = {
  processEndpoint,
};
