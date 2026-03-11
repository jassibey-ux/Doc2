import logger from "../utils/logger";
import jwt from "jsonwebtoken";
import { Error } from "../utils/customeResponse";
import User from "../models/user";


const config = require("../../config/Config").get(process.env.NODE_ENV)
const {JWT_SECRET}=config 
export const ensureAuthorized = (req, res, next) => {
  try {
    const allowedPaths = [
      "/",
      "/login",
      "/forgotPassword",
      "/logoutUser",
      "/all-images",
      "/verifyOTP",
      "/resetPassword",
      "/refresh-token",
      "/verify-mfa",
      "/fax/inbound"
    ];

    if (allowedPaths.includes(req.path)) {
      return next();
    }

    // Paths with dynamic segments that should be public
    if (req.path.startsWith("/family/verify-link/")) {
      return next();
    }

    const bearerHeader = req.headers["authorization"];
    if (!bearerHeader) {
      return Error(res, 404, "No token provided");
    }

    const bearerToken = bearerHeader.split(" ")[1];

    jwt.verify(bearerToken, JWT_SECRET, async (err, decoded) => {
      if (err) {
        return Error(res, 401, "Unauthorized");
      }
      var userdetailsnew = await User.findOne({_id:decoded.userId});
      // logger.debug({ decoded }, "decoded token");
      if(userdetailsnew?.isDeleted)
        {
        return Error(res, 401, "delete_account");
        }
        if(!userdetailsnew.status)
          {
          return Error(res, 401, "status_inactive");
          }
      req.user = decoded;
      // logger.debug({ user: req.user }, "req.user set");

      next();
    });
  } catch (error) {
    return Error(res, 500, error.message);
  }
};
