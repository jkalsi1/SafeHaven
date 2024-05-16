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

mongoose
  .connect(uri)
  .catch((error) => console.log(error));


const uploadProfilePicture = async (file) => {
    try {
        if (!file) {
            throw new Error("No file uploaded");
        }
        
        const data = fs.readFileSync(file.path);
        const profilePicture = new ProfilePictureModel({
            data: data,
            contentType: file.mimetype,
        });

        return await profilePicture.save();
    } catch (error) {
        console.error(error);
        throw error;
    }
}

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

function getPassword(username) { //same as get Users but uses findOne
  let query = {};
  query.username = username;
  return UserModel.findOne(query, {password: 1});
}

function getUsername(username) { //same as get Users but uses findOne
  let query = {};
  query.username = username;
  return UserModel.findOne(query, {username: 1});
}

function generateAccessToken(username) { 
  return new Promise((resolve, reject) => { 
    jwt.sign( 
      { username: username }, 
      process.env.TOKEN_SECRET, 
      { expiresIn: "1d" }, 
      (error, token) => { 
        if (error) reject(error); 
        else resolve(token); 
      } 
    ); 
  }); 
}
function loginUser(req, res)
{
  console.log(req.body)
  const salt = "$2b$10$5u3nVKlTV5RPpREyblmGqe";
  const {username, password} = req.body;
  bcrypt.hash(password, salt)
        .then((hashedPassword) => {
          getPassword(username)
          .then((result) => {
            if (result !== null && result.password === hashedPassword) {
              generateAccessToken(username)
              .then((token) => {
                res.status(200).send(token);
              })
              .catch((error) => {
                res.status(500).send(error);
              });
            }
            else {
              res.status(401).send("Invalid Username or Password");
            }
          })
        })
        .catch((error) => {
          res.status(500).send(error);
        });
}
function signupUser(req, res)
{
  const salt = "$2b$10$5u3nVKlTV5RPpREyblmGqe"; //pregenerated salt
  const { username, password } = req.body; // from form
    if (!username || !password) {
      res.status(400).send("Bad request: Invalid input data.");
    } else {
      getUsername(username)
      .then((result) => {
        if (result !== null && result.username === username) {
          res.status(409).send("Username already taken");
        }
        else {
          bcrypt.hash(password, salt)
          .then((hashedPassword) => {
            generateAccessToken(username).then((token) => {
            console.log("Token:", token);
            res.status(201).send(token);
            addUser({username: username, password: hashedPassword});
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
    jwt.verify(
      token,
      process.env.TOKEN_SECRET,
      (error, decoded) => {
        if (decoded) {
          next();
        } else {
          console.log("JWT error:", error);
          res.status(401).end();
        }
      }
    );
  }
}

function changeUserProfilePicture(id, profilePictureId) {
    return UserModel.findByIdAndUpdate(
        id,
        { profilePicture: profilePictureId },
        { new: true }
      ).exec();}

    
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
};
