import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("auth.invalidEmail"),
  password: z.string().min(8, "auth.passwordMin"),
});

export const signupSchema = z
  .object({
    email: z.string().email("auth.invalidEmail"),
    password: z.string().min(8, "auth.passwordMin"),
    confirmPassword: z.string().min(8, "auth.passwordMin"),
    tosAccepted: z.literal(true, {
      errorMap: () => ({ message: "auth.tosRequired" }),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "auth.passwordMatch",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().email("auth.invalidEmail"),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "auth.passwordMin"),
    confirmPassword: z.string().min(8, "auth.passwordMin"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "auth.passwordMatch",
    path: ["confirmPassword"],
  });

export type LoginForm = z.infer<typeof loginSchema>;
export type SignupForm = z.infer<typeof signupSchema>;
export type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;
