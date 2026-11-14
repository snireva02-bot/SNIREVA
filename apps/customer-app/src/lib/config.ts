/** Demo mode: one-tap demo sign-in + payments without Razorpay (server must also have demo_mode = on). */
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
export const DEMO_PASSWORD = process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? '';
