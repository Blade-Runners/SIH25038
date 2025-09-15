import { Router } from "express";
import { body } from "express-validator";
import { register, login, verify } from "../controllers/user.controller.js";


const userRoutes = new Router()


userRoutes.post("/register", [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Invalid email format"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
], register)

userRoutes.post("/login", [
    body("email").isEmail().withMessage("Invalid email format"),
    body("password").notEmpty().withMessage("Password is required"),
], login)

userRoutes.get("/verify", [
    body('token').isString().withMessage('Invalid token')
], verify)

export default userRoutes;