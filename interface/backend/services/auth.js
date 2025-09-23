import jwt from "jsonwebtoken"


const createToken =(userId, email, password)=>{
    const payload = {userId, email, password}
    
    const secretKey = process.env.JWT_SECRET_KEY
    
    const options = {
        expiresIn: '1h'
    }

    jwt.sign(payload, secretKey, options)
}

const verifyToken = (token)=>{
    
    try {
        if(!token){
            return null
        }
    
        const decodeToken = jwt.verify(token, process.env.JWT_SECRET)
    
        return decodeToken
    } catch (error) {
        console.log("Error in verifyToken",error);
    }
}

export {createToken, verifyToken}