import express from 'express';
import {handleRoot} from '../controllors/handleRoot.js';


export const rootRouter = express.Router();

rootRouter.get('/',handleRoot);