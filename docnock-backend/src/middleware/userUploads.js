import logger from "../utils/logger";
import multer from "multer";
import fs from "fs";
import path from "path";
import { Error } from "../utils/customeResponse";

// Define the base upload folder
const uploadBaseFolder = path.join(__dirname, "../../user-uploads/images");
const profileUploadFolder = path.join(__dirname, "../../user-uploads/profiles");

// Ensure profile upload folder exists
if (!fs.existsSync(profileUploadFolder)) {
  fs.mkdirSync(profileUploadFolder, { recursive: true });
}
// Ensure the base folder exists
if (!fs.existsSync(uploadBaseFolder)) {
  fs.mkdirSync(uploadBaseFolder, { recursive: true });
}

/* Images storage */
// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadBaseFolder); // Save in the images folder
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName); // Use the unique name for the uploaded file
  },
});

// Validate file type
const fileFilter = (req, file, cb) => {
  logger.debug({ mimetype: file.mimetype }, "file filter check");
  
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Accept file
  } else {
    cb(new Error("Only JPG, JPEG, and PNG files are allowed"), false); // Reject file
  }
};

// Initialize multer with storage and file filter
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Max size: 5MB
});

const uploadSingleImage = (fieldName) => async (req, res, next) => {
  logger.debug({ fieldName }, "uploadSingleImage");
  
  try {
    const uploadHandler = upload.single(fieldName);
    uploadHandler(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return Error(res, 400, "File size exceeds 5MB");
        }
        return Error(res, 400, err.message);
      }
      next();
    });
  } catch (err) {
    return Error(res, 500, "An error occurred while uploading the file");
  }
};

// Middleware for multiple image uploads
const uploadMultipleImages =
  (fieldName, maxCount) => async (req, res, next) => {
    try {
      const uploadHandler = upload.array(fieldName, maxCount);
      uploadHandler(req, res, (err) => {
        if (err) {
          logger.error({ err }, "uploadMultipleImages error");

          if (err.code === "LIMIT_FILE_SIZE") {
            return Error(res, 400, "File size exceeds 5MB");
          }
          if (err.code === "LIMIT_UNEXPECTED_FILE") {
            return Error(res, 400, `You can upload upto ${maxCount} Files`);
          }
          return Error(res, 404, err.message);
        }
        next();
      });
    } catch (err) {
      logger.error({ err }, "uploadMultipleImages unexpected error");
      return Error(res, 500, "An error occurred while uploading the file");
    }
  };

/* Profile Storage */

// Configure multer storage for profile images
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, profileUploadFolder); // Save files in profile upload folder
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName); // Save with a unique name
  },
});

// Validate profile image file type
const profileFileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Accept file
  } else {
    cb(new Error("Only JPG, JPEG, PNG and WEBP files are allowed"), false); // Reject file
  }
};

// Initialize multer for profile uploads
const profileUpload = multer({
  storage: profileStorage,
  fileFilter: profileFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Max size: 5MB
});

// Middleware for single profile image upload
const uploadSingleProfileImage = (fieldName) => {
  return async (req, res, next) => {
    try {
      const uploadHandler = profileUpload.single(fieldName);

      if (typeof uploadHandler !== "function") {
        logger.error("uploadHandler is not a function");
        return res.status(500).json({
          error: "Upload handler could not be initialized",
        });
      }

      // Handle the upload
      uploadHandler(req, res, (err) => {
        if (err) {
          logger.error({ err }, "Error in uploadHandler");

          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
              error: "File size exceeds 5MB",
            });
          }

          return res.status(400).json({
            error: err.message || "An unknown error occurred during upload",
          });
        }

        // Proceed to next middleware if no error
        next();
      });
    } catch (err) {
      logger.error({ err }, "Unexpected error in profile image upload");

      return res.status(500).json({
        error: "An unexpected error occurred while uploading the profile image",
      });
    }
  };
};

export { uploadSingleImage, uploadMultipleImages, uploadSingleProfileImage };
