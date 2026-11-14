/** English strings. Add hi.ts with the same keys to support Hindi. */
export const en = {
  common: {
    continue: 'Continue', save: 'Save', cancel: 'Cancel', retry: 'Try again', back: 'Back', done: 'Done',
    offline: "You're offline. Showing last saved details.", somethingWrong: 'Something went wrong.',
    loading: 'Loading', call: 'Call', whatsapp: 'WhatsApp', submit: 'Submit',
  },
  auth: {
    title: 'Rent an electric scooter for your deliveries',
    subtitle: '{rent} per week. Pay by UPI.',
    phoneLabel: 'Mobile number', phoneHint: "We'll send a 6-digit code by SMS",
    sendCode: 'Send code', verifyTitle: 'Enter the code', verifySub: 'Sent to {phone}',
    codeLabel: '6-digit code', verify: 'Verify', resendIn: 'Resend code in {s}s', resend: 'Resend code',
    changeNumber: 'Change number', consent: 'I agree to the Privacy Notice and allow SNIREVA to store my documents for verification.',
    privacy: 'Privacy notice', consentRequired: 'Please accept the privacy notice to continue',
    wrongCode: 'That code is incorrect or expired', tooMany: 'Too many attempts. Wait a few minutes and try again.',
  },
  profile: {
    setupTitle: 'Your details', setupSub: 'Used on your rental agreement.', fullName: 'Full name', address: 'Address',
    emergencyName: 'Emergency contact name', emergencyPhone: 'Emergency contact number',
    platform: 'Delivery platform', photo: 'Profile photo', addPhoto: 'Add photo', changePhoto: 'Change photo',
  },
  docs: {
    title: 'Documents', sub: 'Upload clear photos. All text should be readable.', upload: 'Upload', replace: 'Replace',
    camera: 'Take photo', gallery: 'Choose from gallery', required: 'Required', optional: 'Optional',
    submit: 'Submit for verification', missing: 'Upload all required documents first',
  },
  kyc: {
    submittedTitle: 'Documents submitted', submittedBody: "We'll review them within 24 hours. You'll get a notification.",
    reviewTitle: 'Under review', reviewBody: 'Our team is checking your documents.',
    approvedTitle: "You're verified", approvedBody: 'You can now request a scooter.',
    rejectedTitle: 'Verification failed', rejectedBody: 'Fix the issue below and upload again.',
    notSubmittedTitle: 'Verify your identity', notSubmittedBody: 'Upload Aadhaar, PAN and driving licence to rent a scooter.',
  },
  tabs: { home: 'Home', rental: 'Rental', payments: 'Payments', support: 'Support', profile: 'Profile' },
} as const;
