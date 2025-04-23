import express from 'express';
import { swaggerController } from '../controllers/swaggerController.js';

const swaggerRoutes = express.Router();

// Parse and process swagger documentation
swaggerRoutes.post('/parse', swaggerController.parseSwagger);

// Get raw swagger data without processing
swaggerRoutes.post('/raw', swaggerController.getRawSwaggerData);

swaggerRoutes.post('/form', swaggerController.getEndpointsFormData);

swaggerRoutes.get('/endpoints', swaggerController.getSwaggerEndpoints)

export default swaggerRoutes;