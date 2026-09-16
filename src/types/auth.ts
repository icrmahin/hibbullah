import type { Session } from "@supabase/supabase-js";
import type { User } from "./user";

export type Role = "customer" | "admin";

export type AuthSession = {
  id: string;
  userId: string;
  role: Role;
  email?: string;
  phone?: string;
  isAdmin?: boolean;
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
  syncSession: (sbSession?: Session | null) => Promise<AuthSession | null>;
}
