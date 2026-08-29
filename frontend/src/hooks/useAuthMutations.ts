import { useMutation } from '@tanstack/react-query'

import {
  forgotPassword,
  loginUser,
  registerUser,
  requestOtp,
  resetPassword,
  verifyOtp,
} from '../lib/api'

/**
 * TanStack Query mutations over the real /auth/* endpoints (see
 * src/lib/api.ts) — one per call so each auth screen gets its own
 * isPending/error/reset lifecycle without hand-rolled loading state.
 */

export function useRegisterMutation() {
  return useMutation({ mutationFn: registerUser })
}

export function useRequestOtpMutation() {
  return useMutation({ mutationFn: requestOtp })
}

export function useVerifyOtpMutation() {
  return useMutation({ mutationFn: verifyOtp })
}

export function useLoginMutation() {
  return useMutation({ mutationFn: loginUser })
}

export function useForgotPasswordMutation() {
  return useMutation({ mutationFn: forgotPassword })
}

export function useResetPasswordMutation() {
  return useMutation({ mutationFn: resetPassword })
}
