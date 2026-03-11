const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define the Permission Schema
const permissionSchema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Assuming you have a 'User' model
    required: true,
  },
  moduleName: {
    type: String,
    required: true,
    enum:["F","P","N","S","O","V", "C","R"]
  },
  // new change 29jan start
  noOfLimit: {
    type: Number,
    required: true,
    default:0
  }
  // new change 29jan end
}, { timestamps: true });

// Create the Permission model
const Permission = mongoose.model('Permission', permissionSchema);

module.exports = Permission;
