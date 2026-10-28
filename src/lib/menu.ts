import raw from '../data/menu.json';
import { menuSchema } from './domain';
export const menu = raw.map(item => menuSchema.parse(item));
