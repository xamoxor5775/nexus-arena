import { defineEventHandler } from "h3";
import { resumeFlowReturn } from "../../flow-return";

export default defineEventHandler((event) => resumeFlowReturn(event));
