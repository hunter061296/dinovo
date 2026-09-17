export type Role = "ADMIN" | "MANAGER" | "HOST";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
