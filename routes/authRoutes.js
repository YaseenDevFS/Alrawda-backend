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
        const { name, email, password, bio, location, role, avatar } = req.body;
        const normalizedEmail = email?.trim().toLowerCase();

        // Validate input
        if (!name?.trim() || !normalizedEmail || !password) {
            return res.status(400).json({
                code: "MISSING_FIELDS",
                message: "Please complete your name, email, and password to create your account."
            });
        }

        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
            return res.status(400).json({
                code: "INVALID_EMAIL",
                message: "That email address does not look right. Please check it and try again."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                code: "WEAK_PASSWORD",
                message: "Choose a password with at least 6 characters for better account security."
            });
        }

        const existingUser = await findUserByEmail(normalizedEmail);
        
        if (existingUser) {
            return res.status(409).json({
                code: "EMAIL_IN_USE",
                message: "This email is already registered. Try signing in or use a different email."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const user = await createUser(name.trim(), normalizedEmail, hashedPassword, {
            bio: bio?.trim() || null,
            location: location?.trim() || null,
            role: role?.trim() || 'Quran Learner',
            avatar: avatar?.trim() || null,
        });

        res.status(201).json({
            success: true,
            message: "User created successfully",
            user
        });

    } catch (error) {
        console.error("Signup error:", error);
        if (error.code === "23505") {
            return res.status(409).json({
                code: "EMAIL_IN_USE",
                message: "This email is already registered. Try signing in or use a different email."
            });
        }
        res.status(500).json({
            code: "SIGNUP_FAILED",
            message: "We could not create your account right now. Please try again in a moment."
        });
    }
});

// @route   POST /api/auth/login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = email?.trim().toLowerCase();

        // Validate input
        if (!normalizedEmail || !password) {
            return res.status(400).json({
                code: "MISSING_CREDENTIALS",
                message: "Please enter both your email address and password."
            });
        }

        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
            return res.status(400).json({
                code: "INVALID_EMAIL",
                message: "That email address does not look right. Please check it and try again."
            });
        }

        console.log("Login attempt for email:", normalizedEmail); // Debug log

        const user = await findUserByEmail(normalizedEmail);

        if (!user) {
            console.log("User not found:", normalizedEmail);
            return res.status(404).json({
                code: "EMAIL_NOT_FOUND",
                message: "We could not find an account with this email. Check it or create a new account."
            });
        }

        console.log("User found, comparing password...");

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            console.log("Password mismatch for:", normalizedEmail);
            return res.status(401).json({
                code: "WRONG_PASSWORD",
                message: "That password is incorrect. Please try again or reset your password."
            });
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