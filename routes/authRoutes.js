// backend/routes/authRoutes.js
import jwt from "jsonwebtoken";
import express from "express";
import bcrypt from "bcryptjs";
import { findUserByEmail, createUser, findUserById } from "../models/userModel.js";
import pool from "../db/db.js";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

// @route   POST /api/auth/signup
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const existingUser = await findUserByEmail(email);
        
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const user = await createUser(name, email, hashedPassword);

        res.status(201).json({
            success: true,
            message: "User created successfully",
            user
        });

    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
});

// @route   POST /api/auth/login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        console.log("Login attempt for email:", email); // Debug log

        const user = await findUserByEmail(email);

        if (!user) {
            console.log("User not found:", email);
            return res.status(400).json({ message: "Invalid credentials" });
        }

        console.log("User found, comparing password...");

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            console.log("Password mismatch for:", email);
            return res.status(400).json({ message: "Invalid credentials" });
        }

        console.log("Login successful for:", email);

        const token = jwt.sign(
            { 
                userId: user.id,
                email: user.email,
                name: user.name
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        const { password: _, ...userWithoutPassword } = user;

        res.json({
            success: true,
            token,
            user: userWithoutPassword
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
});

// @route   GET /api/auth/me
router.get("/me", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        console.log("Received token:", token);
        
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("Decoded token:", decoded);
        
        const user = await findUserById(decoded.userId);
        console.log("Found user:", user);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ user });
    } catch (error) {
        console.error("Error in /me endpoint:", error);
        res.status(401).json({ message: "Invalid token", error: error.message });
    }
});

// PUT /api/auth/profile - لتحديث الملف الشخصي
router.put("/profile", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { name, email, bio, location, website, role, level } = req.body;

        // Build dynamic query
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramCount++}`);
            values.push(name);
        }
        if (email !== undefined) {
            updates.push(`email = $${paramCount++}`);
            values.push(email);
        }
        if (bio !== undefined) {
            updates.push(`bio = $${paramCount++}`);
            values.push(bio);
        }
        if (location !== undefined) {
            updates.push(`location = $${paramCount++}`);
            values.push(location);
        }
        if (website !== undefined) {
            updates.push(`website = $${paramCount++}`);
            values.push(website);
        }
        if (role !== undefined) {
            updates.push(`role = $${paramCount++}`);
            values.push(role);
        }
        if (level !== undefined) {
            updates.push(`level = $${paramCount++}`);
            values.push(level);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: "No fields to update" });
        }

        values.push(decoded.userId);
        
        const query = `
            UPDATE users 
            SET ${updates.join(', ')}, updated_at = NOW()
            WHERE id = $${paramCount}
            RETURNING id, name, email, bio, location, website, role, level, created_at, updated_at
        `;
        
        const result = await pool.query(query, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error("Profile update error:", error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: "Invalid token" });
        }
        
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
});

export default router;