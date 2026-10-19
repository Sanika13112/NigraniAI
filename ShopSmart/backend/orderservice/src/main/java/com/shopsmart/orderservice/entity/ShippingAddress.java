package com.shopsmart.orderservice.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/** A copy of the delivery address taken when the order is placed. */
@Embeddable
public class ShippingAddress {

    @Column(name = "ship_full_name", length = 100)
    private String fullName;

    @Column(name = "ship_phone", length = 10)
    private String phone;

    @Column(name = "ship_line1", length = 200)
    private String line1;

    @Column(name = "ship_line2", length = 200)
    private String line2;

    @Column(name = "ship_city", length = 80)
    private String city;

    @Column(name = "ship_state", length = 80)
    private String state;

    @Column(name = "ship_pincode", length = 6)
    private String pincode;

    public ShippingAddress() {
    }

    public ShippingAddress(String fullName, String phone, String line1, String line2,
                           String city, String state, String pincode) {
        this.fullName = fullName;
        this.phone = phone;
        this.line1 = line1;
        this.line2 = line2;
        this.city = city;
        this.state = state;
        this.pincode = pincode;
    }

    public String getFullName() { return fullName; }
    public String getPhone() { return phone; }
    public String getLine1() { return line1; }
    public String getLine2() { return line2; }
    public String getCity() { return city; }
    public String getState() { return state; }
    public String getPincode() { return pincode; }
}
