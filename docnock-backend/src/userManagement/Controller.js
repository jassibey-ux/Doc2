import logger from "../utils/logger";
import User from "../models/user";
import Permission from "../models/Permission";
import LoginRecord from "../models/loginRecord";
import { decryptData, encrypt, encryptData } from "../utils/encryptionUtils";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import axios from "axios";
import {
  getRandomId,
  generateRandomPassword,
  sendOTPEmail,
  sendPasswordSetEmail,
} from "../utils/customeFunction";
import crypto from "crypto";
import mongoose from "mongoose";
import Notification from "../models/notification"; // Path to your Conversation model
import Conversation from "../models/Conversation"; // Path to your Conversation model
import Message from "../models/message";
import RefreshToken from "../models/refreshToken";
import { createAuditEntry } from "../middleware/auditMiddleware";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { encryptPHI, safeDecryptPHI } from "../utils/phiEncryption";
import FacilityMembership from "../models/FacilityMembership";

const config = require("../../config/Config").get(process.env.NODE_ENV);
const { JWT_SECRET, email, branchkey, frontend_url } = config;
const JWT_REFRESH_SECRET = config.JWT_REFRESH_SECRET || JWT_SECRET + "_refresh";
const JWT_EXPIRY = config.JWT_EXPIRY || "1d";
const REFRESH_EXPIRY = config.REFRESH_EXPIRY || "7d";
// new change 29jan start
const allowedModules = ["F", "P", "N", "S", "O", "V", "C", "R"];
// new change 29jan end
const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"]; // For apps behind proxies
  return forwarded ? forwarded.split(",")[0] : req.socket.remoteAddress;
};
async function addLoginRecord(req, userId) {
  try {
    const ip = getClientIp(req);
    const newRecord = await LoginRecord.create({
      userId: userId,
      IP: ip,
    });
    logger.info("New login record added");
    return newRecord._id
  } catch (error) {
    logger.error({ err: error }, "Error adding login record");
  }
}

// Helper: get primary facilityId for JWT claim (non-blocking, returns null if none)
async function getPrimaryFacilityId(userId) {
  try {
    const membership = await FacilityMembership.findOne({
      userId,
      status: "active",
      isPrimary: true,
    }).select("facilityId").lean();
    return membership ? membership.facilityId : null;
  } catch (err) {
    logger.warn({ err }, "Could not resolve primary facility for JWT");
    return null;
  }
}

export const addUser = async (req, res) => {
  try {
    // Extract user data from the form-data request
    const {
      fullName,
      lat,
      long,
      email,
      mobile,
      role,
      geoLocation,
      rolename,
      address,
      maxDistance,
      userId,
    } = req.body;
    var location = { type: "Point", coordinates: [long, lat] };

    var uniqueId = getRandomId();
    var loginuserid = req.user.userId;

    logger.debug({ loginuserid }, "userid");

    const permissions = await Permission.find({ userId: loginuserid });
    logger.debug({ permissionCount: permissions.length }, "permissions retrieved");
    var count = 0;
    if (role == "facility_center") {
      const exists = permissions.filter((item) => item.moduleName === "F");
      logger.debug({ exists }, "facility permission exists check");

      if (exists.length > 0) {
        count = exists[0].noOfLimit;
      }
    } else if (role == "physician") {
      const exists = permissions.filter((item) => item.moduleName === "P");
      if (exists.length > 0) {
        count = exists[0].noOfLimit;
      }
    } else if (role == "nurse") {
      const exists = permissions.filter((item) => item.moduleName === "N");
      if (exists.length > 0) {
        count = exists[0].noOfLimit;
      }
    } else if (role == "subadmin") {
      const exists = permissions.filter((item) => item.moduleName === "S");
      if (exists.length > 0) {
        count = exists[0].noOfLimit;
      }
    } else if (role == "other") {
      const exists = permissions.filter((item) => item.moduleName === "O");
      if (exists.length > 0) {
        count = exists[0].noOfLimit;
      }
    }
    const countused = await User.countDocuments({
      role: role,
      userIds: loginuserid,
      isDeleted: false,
      // Checks if userId exists in userIds array
    });
    logger.debug({ countused, count }, "user count vs limit");
    var rolenew = role.replace("_", " ");
    if (count > 0) {
      if (count <= countused) {
        return res.status(400).json({
          success: false,
          message: `Your add ${rolenew} limit has been exceeded. please contact to the admin`,
        });
      }
    }

    // Check if all required fields are provided
    if (!fullName || !uniqueId || !location || !email || !mobile || !role) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }
    const usersuperadmin = await User.findOne({ role: "superadmin" });
    var userIds = [req.user.userId];
    if (usersuperadmin) {
      var superadminid = String(usersuperadmin._id); // Ensure it's a string
      if (!userIds.includes(superadminid)) {
        userIds.push(superadminid);
      }
    }
    if (userId != undefined) {
      var newUserId = JSON.parse(userId);
      const result = newUserId.filter((num) => num !== req.user.userId);
      userIds = [...userIds, ...result];
    }

    // Check if a user with the same mobile number already exists
    const existingUser = await User.findOne({ mobile, isDeleted: false });
    logger.debug({ existingUserId: existingUser?._id }, "existing user check by mobile");
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "A user with this mobile number already exists",
      });
    }
    const existingUseremail = await User.findOne({ email, isDeleted: false });
    logger.debug({ existingUserEmailId: existingUseremail?._id }, "existing user check by email");

    if (existingUseremail) {
      return res.status(409).json({
        success: false,
        message: "A user with this email id already exists",
      });
    }

    // Extract profile picture if uploaded
    let profilePicture = null;
    if (req.file) {
      logger.debug({ filename: req.file.filename }, "profile picture uploaded");

      profilePicture = {
        originalName: req.file.originalname,
        savedName: req.file.filename,
      };
      logger.debug({ profilePicture }, "profilePicture");
    }
    // Generate a random password — user must set their own via setup email
    const randomPassword = require("crypto").randomBytes(32).toString("hex");
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    // Construct the user data
    const userData = {
      fullName,
      uniqueId,
      userIds,
      location,
      email,
      mobile,
      role,
      geoLocation,
      createdBy: req.user.id,
      profilePicture,
      password: hashedPassword,
      rolename,
      address,
      maxDistance,
    };

    // Create a new user document
    const newUser = new User(userData);
    // Save the user to the database
    var result = await newUser.save();

    const resetToken = jwt.sign({ userId: result._id }, JWT_SECRET, {
      expiresIn: "1d",
    });

    // new change 29jan start
    logger.debug("generating branch.io link for password setup");

    const { data } = await axios.post("https://api2.branch.io/v1/url", {
      branch_key: branchkey,
      data: {
        $canonical_url: `${frontend_url}setup-profile`,
        $desktop_url: `${frontend_url}setup-profile`,
        $ios_url: "https://apps.apple.com/in/app/docnock/id6443465279",
        $android_url: "",
        $fallback_url: `${frontend_url}`,
        custom_data: {
          token: resetToken,
          type: "setup_profile",
        },
      },
    });
    logger.debug({ url: data?.url }, "branch.io link created");
    // return;

    // Create a reset link
    var resetLink = data.url;
    var html = `<p>Click <a href="${resetLink}">here</a> to Setup your password.</p>`;
    var subject = "Password Setup Request";
    sendPasswordSetEmail(email, html, subject);
    // new change 29jan end

    // Respond with success
    return res.status(201).json({
      success: true,
      message: "User added successfully",
    });
  } catch (error) {
    logger.error({ err: error }, "addUser error");
    // Handle validation and other errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors,
      });
    }

    if (error.code === 11000) {
      // Handle unique constraint errors
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        message: `Duplicate value for ${field}`,
      });
    }

    // Handle other errors
    return res.status(500).json({
      success: false,
      message: "An error occurred while adding the user",
      error: error.message,
    });
  }
};

export const login = async (req, res) => {
  try {
    const { mobile, password, lat, long, type } = req.body;

    // Validate input
    if (!mobile || !password) {
      logger.debug("login: missing mobile or password");

      return res.status(400).json({
        success: false,
        message: "Mobile number and password are required",
      });
    }

    // Check if the user exists (mobile may be sent as string or number)
    const mobileQuery = typeof mobile === "string" ? Number(mobile) : mobile;
    const user = await User.findOne({ mobile: mobileQuery, isDeleted: false });
    if (!user) {
      logger.debug("login: user not found");

      return res.status(401).json({
        success: false,
        message: "Invalid mobile number or password",
      });
    }
    if (typeof type !== "undefined") {
      const accessRoles = ["physician", "nurse"];

      if (user?.role && accessRoles.includes(user.role)) {
        // Authorized user logic here
      } else {
        return res.status(401).json({
          success: false,
          message: "Invalid mobile number or password",
        });
      }
    }

    // Check if the user is deleted
    if (user.isDeleted) {
      logger.debug("login: account deleted");

      return res.status(403).json({
        success: false,
        message: "Your account has been deleted. Please contact support.",
      });
    }
    // Check if the user is lock
    if (user.lock) {
      logger.debug("login: account locked");

      return res.status(403).json({
        success: false,
        message:
          "Your login attempt is exceed and lock your account. please forgot your password",
      });
    }

    // Check if the user is active
    if (!user.status) {
      logger.debug("login: account inactive");

      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact support.",
      });
    }
    // new change 29jan start

    if (user.role == "nurse") {
      var geoLocation = user.geoLocation;
      if (geoLocation) {
        const usersuperadmin = await User.findOne({ role: "superadmin" });
        var superadminid = usersuperadmin._id;
        const updatedArray = user.userIds.filter(
          (item) => String(item) !== String(superadminid)
        );
        if (updatedArray.length > 0) {
          const SeniorId = await User.findOne({ _id: updatedArray[0] });
          logger.debug({ seniorId: SeniorId?._id }, "seniorId retrieved");
          var addresslocation = SeniorId.location;
          logger.debug({ addresslocation }, "senior location");
          // Example Usage
          const lat1 = lat,
            lon1 = long;
          const lat2 = addresslocation.coordinates[0],
            lon2 = addresslocation.coordinates[1];

          const distance = getDistance(lat1, lon1, lat2, lon2);
          logger.debug({ distance: distance.toFixed(2) }, "distance calculated (km)");
          if (distance > SeniorId.maxDistance) {
            logger.debug("login: location outside office range");

            return res.status(401).json({
              success: false,
              message:
                "Your Location is outside from your office. please login near by in your office",
            });
          }
        }
      }
    }
    
    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.debug({ userId: user?._id }, "password mismatch");

      user.login_attempts = (user.login_attempts || 0) + 1;

      const MAX_ATTEMPTS = 5;
      const remainingAttempts = MAX_ATTEMPTS - user.login_attempts;

      if (user.login_attempts >= MAX_ATTEMPTS) {
        user.lock = true; // Lock the account
        await user.save();
        logger.debug("login: account locked due to max attempts");
      
        return res.status(401).json({
          success: false,
          message:
            "Your login attempts have been exceeded and your account is locked. Please reset your password.",
        });
      } else {
        logger.debug("login: invalid password attempt");
      
        await user.save();
        return res.status(401).json({
          success: false,
          message: `Invalid mobile number or password. You have ${remainingAttempts} attempt remaining.`,
          remainingAttempts: remainingAttempts,
        });
      }
    }

    // Check if the user 2fa verifies
    if (!user.is_verified) {
      const otp = crypto.randomInt(100000, 999999).toString();
      user.otp = otp;
      user.otpExpires = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes
      await user.save();
      var html = "New otp" + otp;
      var subject = "OTP";
      await sendOTPEmail(user.email, html, subject);

      return res.status(200).json({
        success: true,
        message: "6 digit OTP sent to your email/mobile",
        token: {},
        verify: false,
      });
    }

    // Check if MFA is enabled for this user
    if (user.mfaEnabled) {
      // Check lockExpires for MFA brute-force protection
      if (user.lockExpires && user.lockExpires > new Date()) {
        return res.status(403).json({
          success: false,
          message: "Too many MFA attempts. Try again later.",
        });
      }

      // Issue short-lived MFA session token (5 minutes)
      const mfaSessionToken = jwt.sign(
        { userId: user._id, role: user.role, mfaPending: true },
        JWT_SECRET,
        { expiresIn: "5m" }
      );

      user.login_attempts = 0;
      await user.save();

      createAuditEntry({
        userId: user._id,
        userRole: user.role,
        action: "AUTH_MFA",
        resourceType: "User",
        resourceId: user._id,
        details: { step: "mfa_challenge_issued" },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        success: true,
      });

      return res.status(200).json({
        success: true,
        mfaRequired: true,
        mfaSessionToken,
        message: "MFA verification required",
      });
    }

    var loginsessionid = await addLoginRecord(req, user._id);

    // Generate access token (short-lived) — include primary facilityId if available
    const primaryFacilityId = await getPrimaryFacilityId(user._id);
    const tokenPayload = { userId: user._id, role: user.role };
    if (primaryFacilityId) tokenPayload.facilityId = primaryFacilityId;
    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRY,
    });

    // Generate refresh token (long-lived)
    const refreshTokenValue = crypto.randomBytes(40).toString("hex");
    const refreshExpiresMs = parseExpiry(REFRESH_EXPIRY);
    await RefreshToken.create({
      userId: user._id,
      token: refreshTokenValue,
      expiresAt: new Date(Date.now() + refreshExpiresMs),
      userAgent: req.headers["user-agent"] || "",
      ip: req.ip,
    });

    user.login_attempts = 0;
    user.save();

    // Audit: successful login
    createAuditEntry({
      userId: user._id,
      userRole: user.role,
      action: "AUTH_LOGIN",
      resourceType: "User",
      resourceId: user._id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      refreshToken: refreshTokenValue,
      verify: true,
      role: user.role,
      userId: user._id,
      loginsessionid: loginsessionid,
    });
  } catch (error) {
    logger.error({ err: error }, "Login error");

    return res.status(500).json({
      success: false,
      message: "An error occurred during login",
      error: error.message,
    });
  }
};
function getDistance(lat1, lon1, lat2, lon2) {
  logger.debug({ lat1, lat2, lon1, lon2 }, "getDistance coordinates");
  const R = 6371; // Radius of the Earth in kilometers
  const toRadians = (degree) => (degree * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

export const updateUser = async (req, res) => {
  try {
    // Extract user data from the request
    var {
      editId,
      userIds,
      fullName,
      address,
      email,
      geoLocation,
      mobile,
      lat,
      long,
    } = req.body;
    if (editId == undefined || editId == "") {
      editId = req.user.userId;
    }
    var location = { type: "Point", coordinates: [lat, long] };
    logger.debug({ editId }, "updateUser editId");
    
    // Check if a userId is provided
    if (!editId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }
    const existingUser = await User.findOne({ mobile, _id: { $ne: editId } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "A user with this mobile number already exists",
      });
    }
    const existingUseremail = await User.findOne({
      email,
      _id: { $ne: editId },
    });
    if (existingUseremail) {
      return res.status(409).json({
        success: false,
        message: "A user with this email id already exists",
      });
    }
    // Find the user by userId or uniqueId (based on your application's requirements)
    const user = await User.findOne({ _id: editId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    var userid = [];
    const usersuperadmin = await User.findOne({ role: "superadmin" });
    if (usersuperadmin) {
      var superadminid = String(usersuperadmin._id); // Ensure it's a string
      if (!userid.includes(superadminid)) {
        userid.push(superadminid);
      }
    }

    if (userIds != undefined) {
      var newUserId = JSON.parse(userIds);
      userid = [...userid, ...newUserId];
    } else {
      userid = user.userIds;
    }

    // Update fields only if provided (this allows partial updates)
    if (fullName) user.fullName = fullName;
    if (location) user.location = location;
    if (email) user.email = email;
    if (geoLocation) user.geoLocation = geoLocation;
    if (userid.length > 0) user.userIds = userid;
    if (address) user.address = address;

    // Handle profile picture update (if uploaded)
    if (req.file) {
      user.profilePicture = {
        originalName: req.file.originalname,
        savedName: req.file.filename,
      };
    }

    // Save the updated user document
    await user.save();

      if (req.file) {
       const result = await Conversation.updateMany(
      { "userlist.userid": editId }, // match documents
      { $set: { "userlist.$[elem].name": fullName,
        "userlist.$[elem].profilePicture.originalName": req.file.originalname,
          "userlist.$[elem].profilePicture.savedName": req.file.filename,

       } }, // set new name
      {
        arrayFilters: [{ "elem.userid": new mongoose.Types.ObjectId(editId) }],
        multi: true,
      }
    );
    }
    else
    {
           const result = await Conversation.updateMany(
      { "userlist.userid": editId }, // match documents
      { $set: { "userlist.$[elem].name": fullName
       } }, // set new name
      {
        arrayFilters: [{ "elem.userid": new mongoose.Types.ObjectId(editId) }],
        multi: true,
      }
    );
    }
     
    // Respond with success
    return res.status(200).json({
      success: true,
      message: "User updated successfully",
    });
  } catch (error) {
    // Handle validation and other errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors,
      });
    }

    if (error.code === 11000) {
      // Handle unique constraint errors
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        message: "Duplicate value for ${field}",
      });
    }

    // Handle other errors
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating the user",
      error: error.message,
    });
  }
};

export const changeStatusAndDelete = async (req, res) => {
  try {
    // Extract userId and new status from the request body
    var { status, type, userId } = req.body;
    if (userId == undefined || userId == "") {
      userId = req.user.userId;
    }

    const validtype = ["status", "delete", "geolocation"];
    if (!validtype.includes(type)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid type value. type values are 'status', 'delete','geolocation.",
      });
    }
    logger.debug({ userId, status }, "changeStatusAndDelete");
    // Check if userId and status are provided
    if (!userId || !status) {
      return res.status(400).json({
        success: false,
        message: "User ID and status are required",
      });
    }

    if (type == "status") {
      // Define valid status values
      const validStatuses = ["true", "false"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid status value. Valid values are 'active', 'inactive', or 'suspended'.",
        });
      }
      logger.debug({ userId }, "status change type");

      // Find the user by userId
      const user = await User.findOne({ _id: userId });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      logger.debug({ status }, "updating user status");

      // Update the user's status
      var newstatus = "";
      if (status == "false") {
        newstatus = false;
      } else {
        newstatus = true;
      }
      user.status = newstatus;
      await user.save();
    }
    if (type == "delete") {
      // Find the user by userId
      const userrecord = await User.findOne({ _id: userId });

      logger.debug({ userId: userrecord?._id }, "delete user record");
      if (!userrecord) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      // Update the user's status
      userrecord.isDeleted = true;
      await userrecord.save();
    }
    if (type == "geolocation") {
      // Find the user by userId
      const userrecord = await User.findOne({ _id: userId });

      if (!userrecord) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      // Update the user's status
      userrecord.geoLocation = status;
      await userrecord.save();
    }
    // Save the updated user document
    var message =
      type == "status"
        ? "User status updated  successfully"
        : "User delete successfully";
    // Respond with success
    return res.status(200).json({
      success: true,
      message: message,
    });
  } catch (error) {
    // Handle errors
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating the user status",
      error: error.message,
    });
  }
};

export const listUsers = async (req, res) => {
  try {
    // Extract query parameters for filters
    const { searchKey, status, role, limit, page } = req.query;
    var userId = "";
    if (req.query.userId != "") {
      userId = JSON.parse(req.query.userId);
    } else {
      userId = req.user.userId;
    }
    // Initialize filter object
    const filters = {};
    logger.debug({ status, statusType: typeof status }, "listUsers filter status");
    // If searchKey is provided, filter by email, name, or mobile
    if (searchKey) {
      const searchRegex = { $regex: searchKey, $options: "i" }; // Case-insensitive search
      filters.$or = [
        { email: searchRegex },
        { fullName: searchRegex }, 
        //{ mobile: searchRegex },
      ];
    }

    // If status is provided, filter by status
    if (status) filters.status = status == "true" ? true : false;

    // If role is provided, filter by role
    if (role) filters.role = role;

    // If userId is provided, filter by userId in the array
    logger.debug({ userId }, "listUsers userId filter");
    var accessrole = ["physician", "nurse", "subadmin", "other"];
    if (role == "facility_center" && accessrole.includes(req.user.role)) {
      if (userId) {
        if (Array.isArray(userId) && userId.length > 0) {
          userId = userId.map((id) => new mongoose.Types.ObjectId(id)); // Convert all IDs to ObjectId
          filters._id = { $in: userId }; // Match users where any userId exists in userIds array
        } else if (userId) {
          userId = new mongoose.Types.ObjectId(userId);
          filters._id = { $in: [userId] };
        }
      }
    } else {
      if (userId) {
        if (Array.isArray(userId) && userId.length > 0) {
          userId = userId.map((id) => new mongoose.Types.ObjectId(id)); // Convert all IDs to ObjectId
          filters.userIds = { $in: userId }; // Match users where any userId exists in userIds array
        } else if (userId) {
          userId = new mongoose.Types.ObjectId(userId);
          filters.userIds = { $in: [userId] };
        }
      }
    }
    // Exclude current logged-in user's own record
    filters._id = filters._id
      ? { ...filters._id, $ne: new mongoose.Types.ObjectId(req.user.userId) }
      : { $ne: new mongoose.Types.ObjectId(req.user.userId) };
    logger.debug({ filters }, "listUsers filters");

    const pageNumber = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 10;
    const skip = (pageNumber - 1) * pageSize;
    // Get total count before applying pagination
    const totalRecords = await User.countDocuments({
      ...filters,
      isDeleted: false,
    });

    let users = await User.aggregate([
      { $match: { ...filters, isDeleted: false } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: pageSize },
      {
        $lookup: {
          from: "users", // Assuming the collection name is "users"
          localField: "userIds",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      {
        $addFields: {
          filteredUserNames: {
            $map: {
              input: {
                $filter: {
                  input: "$userDetails", // Array of userDetails
                  as: "user",
                  cond: { $ne: ["$$user.role", "superadmin"] }, // Exclude "superadmin"
                },
              },
              as: "user",
              in: "$$user.fullName", // Only return the fullName
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          fullName: 1,
          email: 1,
          mobile: 1,
          role: 1,
          userIds: 1,
          location: 1,
          geoLocation: 1,
          status: 1,
          isDeleted: 1,
          profilePicture: 1,
          address: 1,
          userNames: "$filteredUserNames", // Use the filtered array
        },
      },
    ]);

    users = users.map((user) => {
      if (user.profilePicture?.savedName) {
        user.profilePicture.actualName = user?.profilePicture?.savedName;
        user.profilePicture.savedName = `${process.env.BASE_PATH}user-uploads/profiles/${user.profilePicture.savedName}`;
      }
      return user;
    });
    const encryptDatauserdata = await encryptData(JSON.stringify(users));

    return res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      encryptDatauserdata,
      totalRecords,
    });
  } catch (error) {
    logger.error({ err: error }, "listUsers error");
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving users",
      error: error.message,
    });
  }
};

export const getUserById = async (req, res) => {
  try {
    // Extract userId from request parameters
    logger.debug({ userId: req.user?.userId }, "getUserById request");

    var userId = req.query.userId;
    if (userId == undefined || userId == "") {
      logger.debug("getUserById: using authenticated userId");

      userId = req.user.userId;
    }
    // Fetch the user by ID from the database
    var user = await User.findById(userId).select("-password"); // Excluding the password field from the response

    // If no user is found, return a 404 error
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const usersuperadmin = await User.findOne({ role: "superadmin" });
    var superadminid = "";
    if (usersuperadmin) {
      superadminid = usersuperadmin._id;
    }
    // Check if removeId is provided in the request
    const removeId = superadminid;
    if (removeId) {
      // Filter the userIds array to exclude the specified removeId
      user.userIds = user.userIds.filter(
        (id) => id.toString() !== removeId.toString()
      );
    }
    if (user.profilePicture?.savedName) {
      user.profilePicture.savedName =
        process.env.BASE_PATH +
        "user-uploads/profiles/" +
        user.profilePicture.savedName;
    }
    logger.debug({ userId: user?._id }, "user retrieved");

    // encryptData user data (if necessary)
    const encryptDatauserdata = await encryptData(JSON.stringify(user));

    return res.status(200).json({
      success: true,
      message: "User retrieved successfully",
      encryptDatauserdata,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving the user",
      error: error.message,
    });
  }
};

export const sendPasswordResetEmail = async (req, res) => {
  try {
    var userId = req.body.userId;
    if (userId == undefined || userId == "") {
      userId = req.user.userId;
    }
    const user = await User.findOne({ _id: userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No user found with that email address",
      });
    }
    // Generate a password reset token (valid for 1 hour)
    const resetToken = jwt.sign({ userId: userId }, JWT_SECRET, {
      expiresIn: "2h",
    });

    const { data } = await axios.post("https://api2.branch.io/v1/url", {
      branch_key: branchkey,
      data: {
        $canonical_url: `${frontend_url}setup-profile`,
        $desktop_url: `${frontend_url}setup-profile`,
        $ios_url: "https://apps.apple.com/in/app/docnock/id6443465279",
        $android_url: "",
        $fallback_url: `${frontend_url}`,
        custom_data: {
          token: resetToken,
          type: "setup_profile",
        },
      },
    });
    // Create a reset link
    var resetLink = data.url;
    var email = user.email;
    var html = `<p>Click <a href="${resetLink}">here</a> to Setup your password.</p>`;
    var subject = "Password Setup Request";
    sendPasswordSetEmail(email, html, subject);

    return res.status(200).json({
      success: true,
      message: "Password reset email sent successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "An error occurred while sending the reset email",
      error: error.message,
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET); // Secret key should match the one used in sending the reset email

    // Find the user by the decoded userId
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.lock = false;
    user.login_attempts = 0;
    user.forgot_password = false;

    // Update the user's password
    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(400).json({
        success: false,
        message: "Reset link has expired. Please request a new one.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Invalid or expired token",
      error: error.message,
    });
  }
};

// new change 29jan start
export const createPermission = async (req, res) => {
  try {
    const { modules } = req.body; // Expecting an array of objects with moduleName & noOfLimit
    var userId = req.body.user_id;
    if (userId == undefined || userId == "") {
      userId = req.user.userId;
    }
    if (!userId) {
      return res
        .status(400)
        .json({ status: true, message: "User ID is required" });
    }

    // Validate modules array
    if (
      !Array.isArray(modules) ||
      !modules.every(
        (m) =>
          allowedModules.includes(m.moduleName) &&
          typeof m.noOfLimit === "number"
      )
    ) {
      return res
        .status(400)
        .json({ status: false, message: "Invalid module data provided" });
    }

    // Delete existing permissions for the user
    await Permission.deleteMany({ userId });

    // Create separate entries for each moduleName with its respective noOfLimit
    const permissionEntries = modules.map((m) => ({
      userId,
      moduleName: m.moduleName,
      noOfLimit: m.noOfLimit, // Assign the specific limit for each module
    }));

    // Insert all permissions into the database
    const createdPermissions = await Permission.insertMany(permissionEntries);

    res.status(201).json({
      status: true,
      message: "Permissions created successfully",
      data: createdPermissions,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
// new change 29jan end

export const getPermissionsByUserId = async (req, res) => {
  try {
    var userId = req.query.userId;
    if (userId == undefined || userId == "") {
      userId = req.user.userId;
    }
    if (!userId) {
      return res
        .status(400)
        .json({ status: false, message: "User ID is required" });
    }

    // Find all permissions for the given userId
    const permissions = await Permission.find({ userId });

    if (permissions.length === 0) {
      return res
        .status(404)
        .json({ status: false, message: "No permissions found for this user" });
    }
    const encryptDatauserdata = await encryptData(JSON.stringify(permissions));

    res.status(200).json({
      status: true,
      message: "Permissions retrieved successfully",
      encryptDatauserdata,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
export const countUsersByRole = async (req, res) => {
  try {
    const { roles, month, year } = req.body;
    let userId = req.body.userId?.length > 0 ? req.body.userId : req.user?.userId;

    if (!Array.isArray(roles) || roles.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Roles array is required." });
    }

    const match = {
      role: { $in: roles },
      isDeleted: false,
    };

    if (req.user?.role !== 'superadmin') {
      if (req.user?.role !== 'facility_center') {
        match.userIds = {
          $in: Array.isArray(userId)
            ? userId.map(id => new mongoose.Types.ObjectId(id))
            : [new mongoose.Types.ObjectId(userId)],
        };
      } else {
        match.userIds = new mongoose.Types.ObjectId(userId);
      }

      // ✅ Exclude the requesting user's own ID from match
      if (req.user?.userId) {
        match._id = { $ne: new mongoose.Types.ObjectId(req.user.userId) };
      }
    }

    if (month != null && year != null) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      match.createdAt = { $gte: start, $lt: end };
    } else if (year != null) {
      const start = new Date(year, 0, 1);
      const end = new Date(Number(year) + 1, 0, 1);
      match.createdAt = { $gte: start, $lt: end };
    }

    const roleCountsRaw = await User.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          role: "$_id",
          count: 1,
          _id: 0,
        },
      },
    ]);

    const roleCountsMap = Object.fromEntries(roleCountsRaw.map(r => [r.role, r.count]));

    const finalCounts = roles.map(role => ({
      role,
      count: roleCountsMap[role] || 0,
    }));

    const encryptDatauserdata = await encryptData(JSON.stringify(finalCounts));

    res.status(200).json({ success: true, encryptDatauserdata });
  } catch (error) {
    logger.error({ err: error }, "countUsersByRole error");
    res.status(500).json({ success: false, message: error.message });
  }
};


export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    var userId = req.body.userId;
    if (userId == undefined || userId == "") {
      userId = req.user.userId;
    }
    if (!userId || !oldPassword || !newPassword) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Old password is incorrect." });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res
      .status(200)
      .json({ success: true, message: "Password changed successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({
        success: false,
        message: "Mobile number and OTP are required",
      });
    }

    const user = await User.findOne({ mobile ,isDeleted:false});
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (user.is_verified) {
      return res.status(400).json({
        success: false,
        message: "Mobile Number Already verified",
      });
    }
    if (user.otp !== otp || Date.now() > user.otpExpires) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    user.is_verified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

       var loginsessionid = await addLoginRecord(req, user._id);

    // Generate JWT token — include primary facilityId if available
    const otpPrimaryFacilityId = await getPrimaryFacilityId(user._id);
    const otpTokenPayload = { userId: user._id, role: user.role };
    if (otpPrimaryFacilityId) otpTokenPayload.facilityId = otpPrimaryFacilityId;
    const token = jwt.sign(otpTokenPayload, JWT_SECRET, {
      expiresIn: "1d",
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      verify: true,
      role: user.role,
      loginsessionid:loginsessionid,
      userId:user._id
    });
    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "An error occurred during OTP verification",
      error: error.message,
    });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No user found with that email address",
      });
    }
    // Generate a password reset token (valid for 1 hour)
    const resetToken = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "2h",
    });

    const { data } = await axios.post("https://api2.branch.io/v1/url", {
      branch_key: branchkey,
      data: {
        $canonical_url: `${frontend_url}reset-password`,
        $desktop_url: `${frontend_url}reset-password`,
        $ios_url: "https://apps.apple.com/in/app/docnock/id6443465279",
        $android_url: "",
        $fallback_url: `${frontend_url}`,
        custom_data: {
          token: resetToken,
          type: "forgot_password",
        },
      },
    });
    // return;

    // Create a reset link
    var resetLink = data.url;
    var html = `<p>Click <a href="${resetLink}">here</a> to reset your password.</p>`;
    var subject = "Forgot Password Request";
    sendPasswordSetEmail(user.email, html, subject);
    // ✅ Set forgot_password flag to true
    user.forgot_password = true;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset email sent successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "An error occurred while sending the reset email",
      error: error.message,
    });
  }
};

export const resendOTP = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required",
      });
    }

    const user = await User.findOne({ mobile ,isDeleted:false });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes
    await user.save();
    var html = "New otp" + otp;
    var subject = "OTP";
    await sendOTPEmail(user.email, otp);

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "An error occurred while resending OTP",
      error: error.message,
    });
  }
};

export const logoutUser = async (req, res) => {
  try {
    const userId = req.query.userId;
    var loginsessionid = req.query.loginsessionid
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }
    logger.debug({ userId }, "logoutUser request");
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    var loginRecord;
if(loginsessionid)
{
   loginRecord = await LoginRecord.findOne({ userId,_id:loginsessionid }).sort({
    createdAt: -1,
  });
}
else
{
   loginRecord = await LoginRecord.findOne({ userId }).sort({
    createdAt: -1,
  });
}
    logger.debug({ loginRecordId: loginRecord?._id }, "login record found");

   
    if (!loginRecord) {
      return res.status(400).json({
        success: false,
        message: "No active login session found",
      });
    }

    if (loginRecord.logoutDate) {
      return res.status(400).json({
        success: false,
        message: "User is already logged out.",
      });
    }
    logger.debug({ loginRecordId: loginRecord?._id }, "checking logout status");

    loginRecord.logoutDate = new Date();
    await loginRecord.save();
    
     await User.findByIdAndUpdate(
      userId,
      { $set: { fcm_token: '' } },
      { new: true }
    );
    logger.debug({ loginRecordId: loginRecord?._id }, "logout completed");

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "An error occurred during logout",
      error: error.message,
    });
  }
};


export const listLoginRecords = async (req, res) => {
  try {
    const userId = req.query.userId; // ✅ use query param
    logger.debug({ userId }, "listLoginRecords request");

    const loginRecords = await LoginRecord.find({ userId }).sort({ createdAt: -1 });

    const encryptDatauserdata = await encryptData(JSON.stringify(loginRecords));

    return res.status(200).json({
      success: true,
      data: encryptDatauserdata,
      message: "Login records fetched successfully",
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching login records");
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

export const getUnreadCountByReceiver = async (req, res) => {
  var userId = req.query.userId;
  if (userId == undefined || userId == "") {
    logger.debug("getUnreadCount: using authenticated userId");

    userId = req.user.userId;
  }
  try {
    const unreadCount = await Notification.countDocuments({
      receiverid:userId,
      is_read: false
    });
    logger.debug({ unreadCount }, "unread notification count");
    
  // const encryptDatauserdata = await encryptData(JSON.stringify(unreadCount));

    res.status(201).json({
      success: true,
      message: "Notification count successfully!",
      count: unreadCount,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching unread count");
    res.status(500).json({ message: 'Server error' });
  }
};

export const fcm_token_save = async (req, res) => {
  try {
    const { fcm_token,device_token } = req.body;
    const user_id = req.user.userId;

    await User.findByIdAndUpdate(
      user_id,
      { $set: { fcm_token: fcm_token ,device_token:device_token} },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "FCM token saved successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "An error occurred while saving FCM token.",
      error: error.message,
    });
  }
};

export const verify_link = async (req, res) =>{
  try {
    const { token,type } = req.body;
    const decoded = jwt.verify(token, JWT_SECRET); // Throws if invalid or expired

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (type === "setup_profile") {
      // If user has already set up their profile (forcePasswordChange is false and they've logged in)
      if (user.is_verified) {
        return res.status(400).json({ success: false, message: "Link already used (Profile already set)" });
      }
    } else if (type === "forgot_password") {
      // If forgot_password flag is false, link is considered already used
      if (!user.forgot_password) {
        return res.status(400).json({ success: false, message: "Link already used or password already reset" });
      }
    } else {
      return res.status(400).json({ success: false, message: "Invalid token type" });
    }

    return res.status(200).json({
      success: true,
      message: "Valid token",
      data: token
    });

  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Link expired or invalid",
      error: err.message,
    });
  }
}

export const encryption_conversion = async(req, res) =>{
  try {
    let {data} = req.body;
    if(data){
     let decrypt = await decryptData(data);
     res.status(200).send({data:decrypt})
    }else{
      res.status(400).send({data: "Data not found"})
    }
  } catch (error) {
    res.status(500).send({data:error})
  }
}

// ---------- SLOT GENERATORS ----------
const generateLast24Hours = () => {
  const slots = [];
  const now = new Date();

  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");

    slots.push(`${yyyy}-${mm}-${dd} ${hh}:00`);
  }
  return slots;
};

const generateLast12Months = () => {
  const slots = [];
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    slots.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return slots;
};

const generateLast2Years = () => {
  const year = new Date().getFullYear();
  return [String(year - 1), String(year)];
};

// ---------- GRAPH API ----------
export const getGraphData = async (req, res) => {
  try {
    const { userid, filterType = "date" } = req.query;
    const userObjectId = new mongoose.Types.ObjectId(userid);

    const conversations = await Conversation.find(
      { "userlist.userid": userObjectId },
      { _id: 1 }
    );
    const conversationIds = conversations.map(c => c._id);

    if (!conversationIds.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    let dateFormat;
    let matchCondition = { conversationId: { $in: conversationIds } };
    let slots = [];
    const now = new Date();

    // ---------- DATE (Last 24 Hours) ----------
    if (filterType === "date") {
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      dateFormat = "%Y-%m-%d %H:00";
      matchCondition.createdAt = { $gte: last24Hours, $lte: now };
      slots = generateLast24Hours();
    }

    // ---------- MONTH (Last 12 Months) ----------
    else if (filterType === "month") {
      const last12Months = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      dateFormat = "%Y-%m";
      matchCondition.createdAt = { $gte: last12Months, $lte: now };
      slots = generateLast12Months();
    }

    // ---------- YEAR (Last 2 Years) ----------
    else if (filterType === "year") {
      const lastYear = new Date(now.getFullYear() - 1, 0, 1);
      dateFormat = "%Y";
      matchCondition.createdAt = { $gte: lastYear, $lte: now };
      slots = generateLast2Years();
    }

    else {
      return res.status(400).json({ success: false, message: "Invalid filterType" });
    }

    // ---------- AGGREGATION ----------
    const rawData = await Message.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: {
            $dateToString: {
              format: dateFormat,
              date: "$createdAt",
              timezone: "+05:30" // IST timezone
            }
          },
          messageCount: {
            $sum: { $cond: [{ $eq: ["$video", false] }, 1, 0] }
          },
          call: {
            $sum: { $cond: [{ $eq: ["$video", true] }, 1, 0] }
          }
        }
      }
    ]);

    // ---------- ZERO FILL ----------
    const dataMap = {};
    rawData.forEach(item => {
      dataMap[item._id] = {
        messageCount: item.messageCount,
        call: item.call
      };
    });

    const finalData = slots.map(slot => ({
      date: slot,
      messageCount: dataMap[slot]?.messageCount || 0,
      call: dataMap[slot]?.call || 0
    }));

    res.status(200).json({
      success: true,
      data: finalData
    });

  } catch (error) {
    logger.error({ err: error }, "Graph API Error");
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

// ---------- ENHANCED ANALYTICS DASHBOARD ----------
export const getAnalyticsDashboard = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ─── 1. Message Volume by Day (30-day rolling) ──────────────────────
    const messageVolumeByDay = await Message.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          total: { $sum: 1 },
          messages: { $sum: { $cond: [{ $eq: ["$video", false] }, 1, 0] } },
          calls: { $sum: { $cond: [{ $eq: ["$video", true] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Zero-fill missing days
    const volumeMap = {};
    messageVolumeByDay.forEach((d) => { volumeMap[d._id] = d; });
    const filledVolume = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      filledVolume.push({
        date: key,
        total: volumeMap[key]?.total || 0,
        messages: volumeMap[key]?.messages || 0,
        calls: volumeMap[key]?.calls || 0,
      });
    }

    // ─── 2. Average Response Time by Role (last 7 days) ─────────────────
    const responseTimeByRole = await Message.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
          readAt: { $ne: null },
          video: false,
          isDeleted: { $ne: true },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "senderID",
          foreignField: "_id",
          as: "sender",
        },
      },
      { $unwind: "$sender" },
      {
        $match: {
          "sender.role": { $in: ["physician", "nurse"] },
        },
      },
      {
        $project: {
          role: "$sender.role",
          responseMs: { $subtract: ["$readAt", "$createdAt"] },
        },
      },
      {
        $group: {
          _id: "$role",
          avgResponseMs: { $avg: "$responseMs" },
          count: { $sum: 1 },
        },
      },
    ]);

    const avgResponseTime = {};
    responseTimeByRole.forEach((r) => {
      avgResponseTime[r._id] = {
        avgSeconds: Math.round((r.avgResponseMs || 0) / 1000),
        sampleSize: r.count,
      };
    });

    // ─── 3. Unacknowledged Critical Alerts ──────────────────────────────
    const unacknowledgedCritical = await Message.aggregate([
      {
        $match: {
          priority: "CRITICAL",
          acknowledgedAt: null,
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          oldest: { $min: "$createdAt" },
        },
      },
    ]);

    // ─── 4. Active Conversations by Facility (last 7 days) ─────────────
    const activeConversations = await Conversation.aggregate([
      { $match: { isDeleted: false, updatedAt: { $gte: sevenDaysAgo } } },
      { $unwind: "$userlist" },
      {
        $lookup: {
          from: "users",
          localField: "userlist.userid",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: "$userInfo" },
      { $match: { "userInfo.role": "facility_center" } },
      {
        $group: {
          _id: "$userInfo._id",
          facilityName: { $first: "$userInfo.fullName" },
          activeChats: { $addToSet: "$_id" },
        },
      },
      {
        $project: {
          facilityId: "$_id",
          facilityName: 1,
          activeChats: { $size: "$activeChats" },
        },
      },
      { $sort: { activeChats: -1 } },
      { $limit: 10 },
    ]);

    // ─── 5. Call Volume by Day (last 30 days) ───────────────────────────
    const callVolumeByDay = await Message.aggregate([
      {
        $match: { createdAt: { $gte: thirtyDaysAgo }, video: true, isDeleted: { $ne: true } },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const callMap = {};
    callVolumeByDay.forEach((d) => { callMap[d._id] = d.count; });
    const filledCallVolume = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      filledCallVolume.push({ date: key, count: callMap[key] || 0 });
    }

    // ─── 6. Fax Volume by Day (last 30 days) ────────────────────────────
    let filledFaxVolume = [];
    try {
      const FaxRecord = mongoose.model("FaxRecord");
      const faxVolumeByDay = await FaxRecord.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              direction: "$direction",
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.date": 1 } },
      ]);

      const faxMap = {};
      faxVolumeByDay.forEach((d) => {
        if (!faxMap[d._id.date]) faxMap[d._id.date] = { inbound: 0, outbound: 0 };
        faxMap[d._id.date][d._id.direction] = d.count;
      });
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        filledFaxVolume.push({
          date: key,
          inbound: faxMap[key]?.inbound || 0,
          outbound: faxMap[key]?.outbound || 0,
        });
      }
    } catch (_) {
      // FaxRecord model may not be registered yet
    }

    // ─── 7. On-Call Coverage Gaps (next 7 days) ─────────────────────────
    let coverageGaps = [];
    try {
      const OnCallSchedule = mongoose.model("OnCallSchedule");
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const schedules = await OnCallSchedule.find({
        startTime: { $lte: nextWeek },
        endTime: { $gte: now },
      }).populate("facilityId", "fullName").lean();

      // Group by facility and find gaps
      const facilitySchedules = {};
      schedules.forEach((s) => {
        const fId = s.facilityId?._id?.toString() || s.facilityId?.toString();
        if (!facilitySchedules[fId]) {
          facilitySchedules[fId] = {
            facilityName: s.facilityId?.fullName || "Unknown",
            slots: [],
          };
        }
        facilitySchedules[fId].slots.push({ start: s.startTime, end: s.endTime });
      });

      for (const [facilityId, data] of Object.entries(facilitySchedules)) {
        const slots = data.slots.sort((a, b) => a.start - b.start);
        for (let i = 0; i < slots.length - 1; i++) {
          if (slots[i].end < slots[i + 1].start) {
            coverageGaps.push({
              facilityId,
              facilityName: data.facilityName,
              gapStart: slots[i].end,
              gapEnd: slots[i + 1].start,
            });
          }
        }
      }
    } catch (_) {
      // OnCallSchedule model may not be registered yet
    }

    // ─── 8. Form Completion Rate ────────────────────────────────────────
    let formCompletionRate = { sent: 0, completed: 0, expired: 0, rate: 0 };
    try {
      const FormSubmission = mongoose.model("FormSubmission");
      const formStats = await FormSubmission.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);

      formStats.forEach((s) => {
        if (s._id === "pending") formCompletionRate.sent += s.count;
        if (s._id === "completed") formCompletionRate.completed += s.count;
        if (s._id === "expired") formCompletionRate.expired += s.count;
      });
      formCompletionRate.sent += formCompletionRate.completed + formCompletionRate.expired;
      formCompletionRate.rate = formCompletionRate.sent > 0
        ? Math.round((formCompletionRate.completed / formCompletionRate.sent) * 100)
        : 0;
    } catch (_) {
      // FormSubmission model may not be registered yet
    }

    // ─── 9. Priority Message Breakdown (last 7 days) ────────────────────
    const priorityBreakdown = await Message.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo }, isDeleted: { $ne: true }, video: false } },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
    ]);

    const priorityCounts = { ROUTINE: 0, URGENT: 0, CRITICAL: 0 };
    priorityBreakdown.forEach((p) => {
      if (p._id) priorityCounts[p._id] = p.count;
    });

    res.status(200).json({
      success: true,
      data: {
        messageVolumeByDay: filledVolume,
        avgResponseTime,
        unacknowledgedCritical: unacknowledgedCritical[0] || { count: 0, oldest: null },
        activeConversationsByFacility: activeConversations,
        callVolumeByDay: filledCallVolume,
        faxVolumeByDay: filledFaxVolume,
        onCallCoverageGaps: coverageGaps,
        formCompletionRate,
        priorityBreakdown: priorityCounts,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Analytics Dashboard Error");
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// ─── Helper: parse expiry string like "7d", "15m", "24h" to ms ─────────────
function parseExpiry(str) {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const val = parseInt(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * (multipliers[unit] || 86400000);
}

// ─── Refresh Token Endpoint ─────────────────────────────────────────────────
export const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: "Refresh token is required" });
    }

    const storedToken = await RefreshToken.findOne({ token: refreshToken });
    if (!storedToken) {
      return res.status(401).json({ success: false, message: "Invalid refresh token" });
    }

    if (storedToken.expiresAt < new Date()) {
      await RefreshToken.deleteOne({ _id: storedToken._id });
      return res.status(401).json({ success: false, message: "Refresh token expired" });
    }

    const user = await User.findById(storedToken.userId);
    if (!user || user.isDeleted || !user.status) {
      await RefreshToken.deleteOne({ _id: storedToken._id });
      return res.status(401).json({ success: false, message: "User account unavailable" });
    }

    // Issue new access token — include primary facilityId if available
    const refreshPrimaryFacilityId = await getPrimaryFacilityId(user._id);
    const refreshPayload = { userId: user._id, role: user.role };
    if (refreshPrimaryFacilityId) refreshPayload.facilityId = refreshPrimaryFacilityId;
    const newAccessToken = jwt.sign(
      refreshPayload,
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Rotate refresh token for security
    const newRefreshTokenValue = crypto.randomBytes(40).toString("hex");
    storedToken.token = newRefreshTokenValue;
    storedToken.expiresAt = new Date(Date.now() + parseExpiry(REFRESH_EXPIRY));
    await storedToken.save();

    return res.status(200).json({
      success: true,
      token: newAccessToken,
      refreshToken: newRefreshTokenValue,
    });
  } catch (error) {
    logger.error({ err: error }, "Refresh token error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ─── Logout All Devices ─────────────────────────────────────────────────────
export const logoutAllDevices = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    await RefreshToken.deleteMany({ userId });
    return res.status(200).json({ success: true, message: "Logged out from all devices" });
  } catch (error) {
    logger.error({ err: error }, "Logout all devices error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ─── Audit Logs (superadmin only) ───────────────────────────────────────────
import AuditLog from "../models/auditLog";

export const listAuditLogs = async (req, res) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { action, userId, page = 1, limit = 50, from, to } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (userId) filter.userId = userId;
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }

    const total = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate("userId", "fullName role")
      .lean();

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      logs,
    });
  } catch (error) {
    logger.error({ err: error }, "Audit logs error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ===========================
// MFA Endpoints
// ===========================

export const setupMfa = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (user.mfaEnabled) {
      return res.status(400).json({ success: false, message: "MFA is already enabled" });
    }

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `DocNock (${user.email || user.mobile})`,
      issuer: "DocNock",
      length: 20,
    });

    // Encrypt the secret before storing
    const encryptedSecret = encryptPHI(secret.base32);
    user.mfaSecret = JSON.stringify(encryptedSecret);
    await user.save();

    // Generate QR code data URL
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    createAuditEntry({
      userId: user._id,
      userRole: user.role,
      action: "AUTH_MFA",
      resourceType: "User",
      resourceId: user._id,
      details: { step: "mfa_setup_initiated" },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });

    return res.status(200).json({
      success: true,
      message: "Scan the QR code with your authenticator app, then verify with a code",
      qrCode: qrCodeDataUrl,
      manualEntryKey: secret.base32,
    });
  } catch (error) {
    logger.error({ err: error }, "MFA setup error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const verifyMfaSetup = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: "Verification code is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (user.mfaEnabled) {
      return res.status(400).json({ success: false, message: "MFA is already enabled" });
    }
    if (!user.mfaSecret) {
      return res.status(400).json({ success: false, message: "MFA setup not initiated. Call /setup-mfa first" });
    }

    // Decrypt the stored secret
    const encryptedSecret = JSON.parse(user.mfaSecret);
    const secret = safeDecryptPHI(encryptedSecret);
    if (!secret) {
      return res.status(500).json({ success: false, message: "Failed to decrypt MFA secret" });
    }

    // Verify the TOTP code
    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token: code,
      window: 1, // Accept codes from ±1 time step (±30s)
    });

    if (!verified) {
      return res.status(401).json({ success: false, message: "Invalid verification code" });
    }

    // Generate 8 backup codes
    const backupCodes = [];
    const hashedBackupCodes = [];
    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(4).toString("hex").toUpperCase();
      backupCodes.push(code);
      const salt = await bcrypt.genSalt(10);
      hashedBackupCodes.push(await bcrypt.hash(code, salt));
    }

    user.mfaEnabled = true;
    user.mfaBackupCodes = hashedBackupCodes;
    await user.save();

    createAuditEntry({
      userId: user._id,
      userRole: user.role,
      action: "AUTH_MFA",
      resourceType: "User",
      resourceId: user._id,
      details: { step: "mfa_enabled" },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });

    return res.status(200).json({
      success: true,
      message: "MFA has been enabled successfully",
      backupCodes,
      warning: "Save these backup codes securely. They will not be shown again.",
    });
  } catch (error) {
    logger.error({ err: error }, "MFA verify setup error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const verifyMfa = async (req, res) => {
  try {
    const { mfaSessionToken, code, backupCode } = req.body;

    if (!mfaSessionToken) {
      return res.status(400).json({ success: false, message: "MFA session token is required" });
    }
    if (!code && !backupCode) {
      return res.status(400).json({ success: false, message: "Verification code or backup code is required" });
    }

    // Verify the MFA session token
    let decoded;
    try {
      decoded = jwt.verify(mfaSessionToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: "MFA session expired. Please login again." });
    }

    if (!decoded.mfaPending) {
      return res.status(401).json({ success: false, message: "Invalid MFA session token" });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.mfaEnabled) {
      return res.status(404).json({ success: false, message: "User not found or MFA not enabled" });
    }

    // Decrypt the stored secret
    const encryptedSecret = JSON.parse(user.mfaSecret);
    const secret = safeDecryptPHI(encryptedSecret);
    if (!secret) {
      return res.status(500).json({ success: false, message: "Failed to decrypt MFA secret" });
    }

    let verified = false;

    if (code) {
      // Verify TOTP code
      verified = speakeasy.totp.verify({
        secret,
        encoding: "base32",
        token: code,
        window: 1,
      });
    } else if (backupCode) {
      // Verify backup code
      for (let i = 0; i < user.mfaBackupCodes.length; i++) {
        const match = await bcrypt.compare(backupCode.toUpperCase(), user.mfaBackupCodes[i]);
        if (match) {
          verified = true;
          // Remove used backup code (single-use)
          user.mfaBackupCodes.splice(i, 1);
          await user.save();
          break;
        }
      }
    }

    if (!verified) {
      // Track failed MFA attempts
      user.login_attempts = (user.login_attempts || 0) + 1;
      if (user.login_attempts >= 5) {
        user.lockExpires = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
        user.login_attempts = 0;
      }
      await user.save();

      createAuditEntry({
        userId: user._id,
        userRole: user.role,
        action: "AUTH_FAIL",
        resourceType: "User",
        resourceId: user._id,
        details: { step: "mfa_verification_failed" },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        success: false,
        failureReason: "invalid_mfa_code",
      });

      return res.status(401).json({ success: false, message: "Invalid verification code" });
    }

    // MFA verified — issue full tokens
    var loginsessionid = await addLoginRecord(req, user._id);

    // Include primary facilityId in JWT if available
    const mfaPrimaryFacilityId = await getPrimaryFacilityId(user._id);
    const mfaPayload = { userId: user._id, role: user.role };
    if (mfaPrimaryFacilityId) mfaPayload.facilityId = mfaPrimaryFacilityId;
    const token = jwt.sign(mfaPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRY,
    });

    const refreshTokenValue = crypto.randomBytes(40).toString("hex");
    const refreshExpiresMs = parseExpiry(REFRESH_EXPIRY);
    await RefreshToken.create({
      userId: user._id,
      token: refreshTokenValue,
      expiresAt: new Date(Date.now() + refreshExpiresMs),
      userAgent: req.headers["user-agent"] || "",
      ip: req.ip,
    });

    user.login_attempts = 0;
    user.lockExpires = null;
    await user.save();

    createAuditEntry({
      userId: user._id,
      userRole: user.role,
      action: "AUTH_LOGIN",
      resourceType: "User",
      resourceId: user._id,
      details: { step: "mfa_verified" },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      refreshToken: refreshTokenValue,
      verify: true,
      role: user.role,
      userId: user._id,
      loginsessionid,
    });
  } catch (error) {
    logger.error({ err: error }, "MFA verify error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const disableMfa = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: "Current TOTP code is required to disable MFA" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (!user.mfaEnabled) {
      return res.status(400).json({ success: false, message: "MFA is not enabled" });
    }

    // Decrypt and verify the current TOTP code
    const encryptedSecret = JSON.parse(user.mfaSecret);
    const secret = safeDecryptPHI(encryptedSecret);
    if (!secret) {
      return res.status(500).json({ success: false, message: "Failed to decrypt MFA secret" });
    }

    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token: code,
      window: 1,
    });

    if (!verified) {
      return res.status(401).json({ success: false, message: "Invalid TOTP code" });
    }

    user.mfaEnabled = false;
    user.mfaSecret = undefined;
    user.mfaBackupCodes = [];
    await user.save();

    createAuditEntry({
      userId: user._id,
      userRole: user.role,
      action: "AUTH_MFA",
      resourceType: "User",
      resourceId: user._id,
      details: { step: "mfa_disabled" },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });

    return res.status(200).json({
      success: true,
      message: "MFA has been disabled successfully",
    });
  } catch (error) {
    logger.error({ err: error }, "MFA disable error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ─── Check Mobile Exists ─────────────────────────────────────────────────
export const checkMobileExists = async (req, res) => {
  try {
    const { mobile, excludeUserId } = req.query;
    if (!mobile) {
      return res.status(400).json({ success: false, message: "Mobile number is required" });
    }

    const query = { mobile: Number(mobile), isDeleted: false };
    if (excludeUserId) {
      query._id = { $ne: new mongoose.Types.ObjectId(excludeUserId) };
    }

    const existing = await User.findOne(query).select("fullName role").lean();
    if (existing) {
      return res.status(200).json({
        exists: true,
        userName: existing.fullName,
        role: existing.role,
      });
    }
    return res.status(200).json({ exists: false });
  } catch (error) {
    logger.error({ err: error }, "checkMobileExists error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};