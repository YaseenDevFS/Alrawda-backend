// backend/routes/authRoutes.js
import jwt from "jsonwebtoken";
import express from "express";
import bcrypt from "bcryptjs";
import { findUserByEmail, createUser, findUserById } from "../models/userModel.js";
//                                      ^^^^^^^^^^^^^^ أضف هذه
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

// @route   POST /api/auth/signup
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

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
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// @route   POST /api/auth/login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await findUserByEmail(email);

        if (!user) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

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
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// @route   GET /api/auth/me
router.get("/me", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        console.log("Received token:", token); // ✅ للـ debugging
        
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("Decoded token:", decoded); // ✅ للـ debugging
        
        const user = await findUserById(decoded.userId);
        console.log("Found user:", user); // ✅ للـ debugging

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

        const query = `
            UPDATE users 
            SET name = COALESCE($1, name),
                email = COALESCE($2, email),
                bio = COALESCE($3, bio),
                location = COALESCE($4, location),
                website = COALESCE($5, website),
                role = COALESCE($6, role),
                level = COALESCE($7, level)
            WHERE id = $8
            RETURNING id, name, email, bio, location, website, role, level, created_at
        `;
        
        const result = await pool.query(query, [name, email, bio, location, website, role, level, decoded.userId]);
        
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});
export default router;