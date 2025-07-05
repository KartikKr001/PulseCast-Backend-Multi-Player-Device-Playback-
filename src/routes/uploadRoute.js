import express from 'express';
import {handleUploadComplete} from '../controllors/handleUpload.js';


export const uploadRouter = express.Router();

uploadRouter.post('/',handleUploadComplete);