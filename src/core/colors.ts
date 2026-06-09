import { NODE_TYPE_COLOR, NODE_TYPE_COLOR_DARK } from './config.js';

export function nodeColor(type: string): string {
  return NODE_TYPE_COLOR[type] ?? NODE_TYPE_COLOR.default;
}

export function nodeColorDark(type: string): string {
  return NODE_TYPE_COLOR_DARK[type] ?? NODE_TYPE_COLOR_DARK.default;
}
