import mongoose from "mongoose";
import UserModel from "../models/user.js";
import ProfilePictureModel from "../models/profile-picture.js";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();
const uri = process.env.MONGODB_URI;
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

mongoose.set("debug", true);

mongoose.connect(uri).catch((error) => console.log(error));

const uploadProfilePicture = async (file) => {
  try {
    if (!file) {
      throw new Error("No file uploaded");
    }

    const data = fs.readFileSync(file.path);
    const profilePicture = new ProfilePictureModel({
      data: data,
      contentType: file.mimetype
    });

    return await profilePicture.save();
  } catch (error) {
    console.error(error);
    throw error;
  }
};

function getUsers(username, name, profilePicture) {
  let query = {};
  if (username) {
    query.username = username;
  }
  if (name) {
    query.name = name;
  }
  if (profilePicture) {
    query.profilePicture = profilePicture;
  }
  return UserModel.find(query);
}

function getPassword(username) {
  //same as get Users but uses findOne
  let query = {};
  query.username = username;
  return UserModel.findOne(query, {  _id: 1, password: 1 });
}

function getUsername(username) {
  //same as get Users but uses findOne
  let query = {};
  query.username = username;
  return UserModel.findOne(query, { _id: 1, username: 1 });
}

function generateAccessToken(userID) {
  return new Promise((resolve, reject) => {
    jwt.sign({ _id: userID }, process.env.TOKEN_SECRET, { expiresIn: "1d" }, (error, token) => {
      if (error) reject(error);
      else resolve(token);
    });
  });
}
function loginUser(req, res) {
  console.log(req.body);
  const salt = "$2b$10$5u3nVKlTV5RPpREyblmGqe";
  const { username, password } = req.body;
  bcrypt
    .hash(password, salt)
    .then((hashedPassword) => {
      getPassword(username).then((result) => {
        if (result !== null && result.password === hashedPassword) {
          generateAccessToken(result._id)
            .then((token) => {
              res.status(200).send(token);
            })
            .catch((error) => {
              res.status(500).send(error);
            });
        } else {
          res.status(401).send("Invalid Username or Password");
        }
      });
    })
    .catch((error) => {
      res.status(500).send(error);
    });
}
function signupUser(req, res) {
  const salt = "$2b$10$5u3nVKlTV5RPpREyblmGqe"; //pregenerated salt
  const { username, password } = req.body; // from form
  if (!username || !password) {
    res.status(400).send("Bad request: Invalid input data.");
  } else {
    getUsername(username).then((result) => {
      if (result !== null ) {
        res.status(409).send("Username already taken");
      } else {
        bcrypt.hash(password, salt).then((hashedPassword) => {
          addUser({ username: username, password: hashedPassword }).then((savedUser) => {
            generateAccessToken(savedUser._id).then((token) => {
              console.log("Token:", token);
              res.status(201).send(token);
              }).catch((error) => {
              res.status(500).send(error);
              });
          }).catch((error) => {
            res.status(500).send(error);
          });
        });
      }
    });
  }
}

function authenticateUser(req, res, next) {
  const authHeader = req.headers["authorization"];
  //Getting the 2nd part of the auth header (the token)
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    console.log("No token received");
    res.status(401).end();
  } else {
    jwt.verify(token, process.env.TOKEN_SECRET, (error, decoded) => {
      if (decoded) {
        req.userID = decoded._id;
        //console.log(req.userID);
        next();
      } else {
        console.log("JWT error:", error);
        res.status(401).end();
      }
    });
  }
}

function editProfile(id, bio, skills) {
  return UserModel.findByIdAndUpdate(
    id,
    {
      bio: bio,
      skills: skills
    },
    {new: true}
  );
}

function changeUserProfilePicture(id, profilePictureId) {
  return UserModel.findByIdAndUpdate(
    id,
    { profilePicture: profilePictureId },
    { new: true }
  ).exec();
}

function findUserById(id) {
  return UserModel.findById(id);
}

function findProfilePictureById(id) {
  return ProfilePictureModel.findById(id);
}

function removeUser(id) {
  return UserModel.findByIdAndDelete(id);
}

function addUser(user) {
  const userToAdd = new UserModel(user);
  let promise = userToAdd.save();
  return promise;
}

async function addProductToUser(id, productId) {
  try {
    // Find the user and add the product to their list
    console.log(id);
    const user = await UserModel.findById(id);
    if (!user) {
      throw new Error("User not found");
    }

    user.products.push(productId);
    await user.save();

    console.log(`Product ${productId} added to user ${id}`);
  } catch (error) {
    console.error("Error adding product to user:", error);
  }
}

function removeProductFromUserID(userID, productIDToRemove) {
  return UserModel.updateOne({ _id: userID }, { $pull: { products: productIDToRemove } });
}

async function addOrderToUser(id, order) {
  try {
    const user = await UserModel.findById(id).populate('products');
    if (!user) {
      throw new Error("User not found");
    }
    for (const item of order.items) {
      const product = user.products.find(prod => prod.product === item.product);

      if (!product) {
        throw new Error(`Product ${item.product} not found for user ${id}`);
      }
      product.quantity -= item.quantity;
      await product.save();
    }
    user.orders.push(order.id);
    await user.save();

    console.log(`Order ${order.id} added to user ${id}`);
  } catch (error) {
    console.error("Error adding order to user:", error);
  }
}

async function getProductOrderCounts(userId) {
  try {
    const user = await UserModel.findById(userId).populate('products orders');

    if (!user) {
      throw new Error("User not found");
    }


    const productOrderCounts = {};
    for (const product of user.products) {
      let productCount = 0;
      for (const order of user.orders) {
        const orderContainsProduct = order.items.some(item => item.product === product.product);
        if (orderContainsProduct) {
          productCount++;
        }
      }
      productOrderCounts[product.product] = productCount;
    }
    return productOrderCounts;
  } catch (error) {
    console.error("Error getting product order counts:", error);
    throw error;
  }
}


function removeOrderFromUserID(userID, orderIDToRemove) {
  return UserModel.updateOne({ _id: userID }, { $pull: { orders: orderIDToRemove } });
}

async function hasProduct(userID, productName) {
    const user = await findUserById(userID).populate("products");
    if (!user || !user.products) {
        return false;
    }
    return user.products.some(product => product.product === productName);
}

async function quantityCheck(userID, productName, desiredQuantity) {
  const user = await findUserById(userID).populate("products");
  if (!user || !user.products) {
      return false;
  }
  let product = null;
  for (let i = 0; i < user.products.length; i++) {
    if (user.products[i].product === productName) {
        product = user.products[i];
        break;
    }
}
  if (product.quantity < desiredQuantity) {
    return product.quantity;       
  }
  return true;
}


export default {
  addUser,
  removeUser,
  getUsers,
  loginUser,
  signupUser,
  authenticateUser,
  findUserById,
  findProfilePictureById,
  uploadProfilePicture,
  changeUserProfilePicture,
  editProfile,
  addProductToUser,
  removeProductFromUserID,
  addOrderToUser,
  removeOrderFromUserID,
  hasProduct,
  quantityCheck,
  getProductOrderCounts
};