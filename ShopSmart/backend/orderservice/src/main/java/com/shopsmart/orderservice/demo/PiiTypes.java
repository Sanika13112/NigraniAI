package com.shopsmart.orderservice.demo;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Names the kinds of personal data present in a text, using Microsoft Presidio's entity names. */
public final class PiiTypes {

    private static final Pattern EMAIL = Pattern.compile("[\\w.+-]+@[\\w-]+\\.[\\w.]+");
    private static final Pattern PHONE = Pattern.compile("(?<!\\d)[6-9]\\d{9}(?!\\d)");
    private static final Pattern AADHAAR = Pattern.compile("(?<!\\d)[2-9]\\d{3}\\s?\\d{4}\\s?\\d{4}(?!\\d)");
    private static final Pattern PAN = Pattern.compile("\\b[A-Z]{5}\\d{4}[A-Z]\\b");

    private PiiTypes() {
    }

    /** personName / location are added when the caller knows the text contains them. */
    public static List<String> of(String text, boolean personName, boolean location) {
        List<String> types = new ArrayList<>();
        if (personName) types.add("PERSON");
        if (text != null && EMAIL.matcher(text).find()) types.add("EMAIL_ADDRESS");
        if (text != null && PHONE.matcher(text).find()) types.add("PHONE_NUMBER");
        if (location) types.add("LOCATION");
        if (text != null && AADHAAR.matcher(text).find()) types.add("IN_AADHAAR");
        if (text != null && PAN.matcher(text).find()) types.add("IN_PAN");
        return types;
    }
}
