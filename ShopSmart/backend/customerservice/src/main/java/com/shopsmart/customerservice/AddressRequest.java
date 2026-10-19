package com.shopsmart.customerservice;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record AddressRequest(
        @Size(max = 30, message = "Label must be at most 30 characters") String label,
        @NotBlank(message = "Full name is required") @Size(max = 100, message = "Full name must be at most 100 characters") String fullName,
        @NotBlank(message = "Phone is required") @Pattern(regexp = "^[6-9][0-9]{9}$", message = "Enter a valid 10-digit mobile number") String phone,
        @NotBlank(message = "Address line 1 is required") @Size(max = 200, message = "Address line 1 is too long") String line1,
        @Size(max = 200, message = "Address line 2 is too long") String line2,
        @NotBlank(message = "City is required") @Size(max = 80, message = "City is too long") String city,
        @NotBlank(message = "State is required") @Size(max = 80, message = "State is too long") String state,
        @NotBlank(message = "PIN code is required") @Pattern(regexp = "^[1-9][0-9]{5}$", message = "Enter a valid 6-digit PIN code") String pincode,
        Boolean makeDefault) {
}
