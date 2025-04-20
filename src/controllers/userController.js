import { databaseService } from "../services/databaseService.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Create a new user
 */
async function createUser(req, res) {
  const { name, email, phone } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required." });
  }

  try {
    const user = await databaseService.createUser({
      user_id: uuidv4(),
      name,
      email,
      phone,
    });

    res.status(201).json(user);
  } catch (err) {
    console.error("Error creating user:", err.message);
    res.status(500).json({ error: "Failed to create user." });
  }
}

/**
 * Get user by ID
 */
async function getUserById(req, res) {
  const { userId } = req.params;

  try {
    const user = await databaseService.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json(user);
  } catch (err) {
    console.error("Error fetching user:", err.message);
    res.status(500).json({ error: "Failed to fetch user." });
  }
}

/**
 * Get all API endpoints for a user
 */
async function getUserEndpoints(req, res) {
  const { userId } = req.params;

  try {
    const endpoints = await databaseService.getApiEndpointsByUserId(userId);
    res.json(endpoints);
  } catch (err) {
    console.error("Error fetching endpoints:", err.message);
    res.status(500).json({ error: "Failed to fetch endpoints." });
  }
}

// Export as a flat object for controller use
export const userController = {
  createUser,
  getUserById,
  getUserEndpoints,
};
