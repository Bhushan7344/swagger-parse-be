import express from "express";
import { userController } from "../controllers/userController.js";

const userRoutes = express.Router();

// Create a new user
userRoutes.post("/", userController.createUser);

// Get user by ID
userRoutes.get("/:userId", userController.getUserById);

// Get API endpoints for a user
userRoutes.get("/:userId/endpoints", userController.getUserEndpoints);

export default userRoutes;
