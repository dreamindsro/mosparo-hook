import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
export default {
  // This app sits inside the library's repository, which has a lockfile of
  // its own. Tell Next.js that the app is its own root.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};
