import { swaggerService } from "../services/swaggerService.js";

/**
 * Parse Swagger documentation from a URL and save processed data
 */
async function parseSwagger(req, res) {
  const { url, user_id: userId, total_requests, threads, selectedIds, token } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing "url" in request body.' });
  }

  if (!userId) {
    return res.status(400).json({ error: 'Missing "user_id" in request body.' });
  }

  if (!total_requests) {
    return res.status(400).json({ error: 'Missing "total_requests" in request body.' });
  }

  if (!threads) {
    return res.status(400).json({ error: 'Missing "threads" in request body.' });
  }

  try {
    const result = await swaggerService.processSwaggerData(url, userId, total_requests, threads, selectedIds, token);
    res.json(result);
  } catch (err) {
    console.error("Error parsing Swagger docs:", err.message);
    res.status(500).json({ error: "Failed to fetch or parse Swagger data." });
  }
}

async function getEndpointsFormData(req, res) {
  const { url, selectedIds } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing "url" in request body.' });
  }

  try {
    const result = await swaggerService.extractRequestBodyTemplates(url, selectedIds);
    res.json(result);
  } catch (err) {
    console.error("Error parsing Swagger docs:", err.message);
    res.status(500).json({ error: "Failed to fetch or parse Swagger data." });
  }
}

/**
 * Fetch raw Swagger data without processing
 */
async function getRawSwaggerData(req, res) {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing "url" in request body.' });
  }

  try {
    const result = await swaggerService.getSwaggerData(url);
    res.json(result);
  } catch (err) {
    console.error("Error parsing Swagger docs:", err.message);
    res.status(500).json({ error: "Failed to fetch or parse Swagger data." });
  }
}

async function getSwaggerEndpoints(req, res) {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: "Missing 'url' query parameter" });
    }

    const endpoints = await swaggerService.getSwaggerEndpointPaths(url);
    return res.status(200).json({ endpoints });
  } catch (error) {
    console.error("Swagger controller error:", error);
    return res.status(500).json({ error: "Failed to fetch Swagger endpoints" });
  }
}

export const swaggerController = {
  parseSwagger,
  getRawSwaggerData,
  getSwaggerEndpoints,
  getEndpointsFormData
};
