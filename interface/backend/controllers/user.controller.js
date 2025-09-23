import User from "../models/user.model.js";
import { cookie, validationResult } from "express-validator";
import bcrypt from "bcrypt";
import crypto from 'crypto';
import { createToken, verifyToken } from "../services/auth.js";
import { createResponse } from "../crossResponse.js";
import axios from "axios";

const register = async (req, res) => {
    try {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { name, email, password } = req.body;
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                message: "User already exists",
                success: false
            })
        }

        const hashPassword = await bcrypt.hash(password, 10);
        const UUID = crypto.randomUUID();

        // Register UUID with the blockchain and get an access key
        const blockchainResponse = await axios.post('http://localhost:3000/api/register', { uuid: UUID });
        
        if (!blockchainResponse.data || !blockchainResponse.data.key) {
            return res.status(500).json({
                success: false,
                message: "Failed to register user with the blockchain registry."
            });
        }

        const newUser = new User({
            name,
            email,
            password: hashPassword,
            userid: UUID,
            privatekey: blockchainResponse.data.key,
        })
        const savedUser = await newUser.save();

        const token = createToken(savedUser);

        res.cookie('userToken', token, { maxAge: 3600000, httpOnly: true, secure: true })


        return res.status(201).json({
            success: true,
            message: "User created successfully",
            user: {
                name: savedUser.name,
                email: savedUser.email,
            },
            token: token
        });

    } catch (error) {
        console.error('Signup error:', error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
}

const login = async (req, res) => {

    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: "Invalid credentials"
            });
        }
        const token = createToken(user);


        res.cookie('userToken', token, {
            maxAge: 3600000,
            httpOnly: true,
            secure: true
        })

        return res.status(200).json({
            success: true,
            message: "Login successful",
            user: {
                name: user.name,
                email: user.email,
            }
        })

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
}


const verify = async (req,res)=>{

    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(400).json({errors: errors.array()});
    }

    const token = req.cookies.userToken
;

    if (!token) {
        return res.status(400).json({
            success:false,
            message:"invalid token"
        })
    }

    const user = verifyToken(token)

    if(user){
        return createResponse(200).json({
            success:true,
            message:"valid token"
        })
    }
}

export {register, login, verify}