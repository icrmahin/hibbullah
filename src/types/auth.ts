import type { User } from "./user";

export type Role = "customer" | "admin";

export type AuthSession = {
  id: string;
  userId: string;
  role: Role;
  email?: string;
  phone?: string;
  isAdmin: boolean;
};

export type LoginForm = {
  email: string;
  password: string;
};

export type RegisterForm = {
  name: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export interface AuthState {
  user: User | null;
  session: AuthSession | null;
  isAdmin: boolean;
  loading: boolean;
}

export interface AuthContextType extends AuthState {
  signOut: () => Promise<void>;
  logout: () => Promise<void>;
  login: (form: LoginForm) => Promise<AuthSession>;
  register: (form: RegisterForm) => Promise<AuthSession>;
  refreshUser: () => Promise<void>;
  /** Changes the signed-in user's password. Verifies the current one first. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Emails a recovery link that deep-links back into the app. */
  sendPasswordResetEmail: (email: string) => Promise<void>;
}
