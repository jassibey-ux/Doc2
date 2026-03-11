import logger from "./logger";

// Success Response
export const Success = (res, code, message, data = null) => {
  // logger.debug({ code, message }, "Success response");
  
  return res.status(code).json({
    success: true,
    statusCode: code,
    message: message,
    data: data,
  });
};

// Error Response
export const Error = (res, code, message, error = null) => {
  // logger.debug({ code, message }, "Error response");

  return res.status(code).json({
    success: false,
    statusCode: code,
    message: message,
  });
};
