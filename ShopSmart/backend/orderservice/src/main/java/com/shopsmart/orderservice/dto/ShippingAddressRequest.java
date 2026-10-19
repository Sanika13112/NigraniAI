package com.shopsmart.orderservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ShippingAddressRequest(
        @NotBlank(message = "Recipient name is required") @Size(max = 100) String fullName,
        @NotBlank(message = "Phone is required") @Pattern(regexp = "^[6-9][0-9]{9}$", message = "Enter a valid 10-digit mobile number") String phone,
        @NotBlank(message = "Address line 1 is required") @Size(max = 200) String line1,
        @Size(max = 200) String line2,
        @NotBlank(message = "City is required") @Size(max = 80) String city,
        @NotBlank(message = "State is required") @Size(max = 80) String state,
        @NotBlank(message = "PIN code is required") @Pattern(regexp = "^[1-9][0-9]{5}$", message = "Enter a valid 6-digit PIN code") String pincode) {
}
