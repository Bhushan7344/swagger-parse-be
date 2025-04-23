import express from "express";
import dotenv from "dotenv";
import swaggerRoutes from "./src/routes/swaggerRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import cors from 'cors';
// Load environment variables
dotenv.config();

const app = express();
app.use(cors('*'));
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.use("/api/swagger", swaggerRoutes);
app.use("/api/users", userRoutes);

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
