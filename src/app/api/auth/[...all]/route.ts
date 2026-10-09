import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/server/auth/auth";

// Endpoint bawaan Better Auth (masuk, sesi). Pendaftaran dan endpoint admin ditutup di konfigurasi auth.
export const { GET, POST } = toNextJsHandler(auth);
