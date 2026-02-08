#!/usr/bin/env node
import { createProgram } from './index';

const program = createProgram();
program.parse(process.argv);
