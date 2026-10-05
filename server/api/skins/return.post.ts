import { defineEventHandler } from "h3";
import { resumeSkinsReturn } from "../../skins-return";

export default defineEventHandler((event) => resumeSkinsReturn(event));
