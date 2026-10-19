package com.shopsmart.customerservice.demo;

import java.util.concurrent.ThreadLocalRandom;

import org.slf4j.MDC;

/**
 * Fictional personal data for the PII_IN_LOGS demo scenario. Real customer data is never used:
 * names come from fixed lists, emails use the reserved example.in domain, and Aadhaar numbers are
 * random 12-digit values with a valid Verhoeff checksum that belong to no one.
 */
public final class SyntheticPii {

    private static final String[] FIRST = {"Aarav", "Ananya", "Vihaan", "Diya", "Ishaan", "Kavya", "Arjun", "Meera",
            "Rohan", "Saanvi", "Kabir", "Nisha", "Aditya", "Pooja", "Rahul", "Sneha"};
    private static final String[] LAST = {"Sharma", "Kulkarni", "Iyer", "Patil", "Reddy", "Nair", "Deshmukh", "Gupta",
            "Joshi", "Menon", "Rao", "Bose", "Chopra", "Pawar"};
    private static final String[] STREET = {"MG Road", "Lake View Road", "Station Road", "Temple Street", "Gandhi Nagar",
            "Shivaji Nagar", "Park Avenue", "Hill Road"};
    private static final String[][] CITY = {{"Pune", "Maharashtra", "411"}, {"Mumbai", "Maharashtra", "400"},
            {"Bengaluru", "Karnataka", "560"}, {"Chennai", "Tamil Nadu", "600"}, {"Hyderabad", "Telangana", "500"},
            {"Kochi", "Kerala", "682"}};

    private static final int[][] D = {{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}, {1, 2, 3, 4, 0, 6, 7, 8, 9, 5}, {2, 3, 4, 0, 1, 7, 8, 9, 5, 6},
            {3, 4, 0, 1, 2, 8, 9, 5, 6, 7}, {4, 0, 1, 2, 3, 9, 5, 6, 7, 8}, {5, 9, 8, 7, 6, 0, 4, 3, 2, 1}, {6, 5, 9, 8, 7, 1, 0, 4, 3, 2},
            {7, 6, 5, 9, 8, 2, 1, 0, 4, 3}, {8, 7, 6, 5, 9, 3, 2, 1, 0, 4}, {9, 8, 7, 6, 5, 4, 3, 2, 1, 0}};
    private static final int[][] P = {{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}, {1, 5, 7, 6, 2, 8, 3, 0, 9, 4}, {5, 8, 0, 3, 7, 9, 6, 1, 4, 2},
            {8, 9, 1, 6, 0, 4, 3, 5, 2, 7}, {9, 4, 5, 3, 1, 2, 6, 8, 7, 0}, {4, 2, 8, 6, 5, 7, 3, 9, 0, 1}, {2, 7, 9, 3, 8, 0, 6, 4, 1, 5},
            {7, 0, 4, 6, 9, 1, 3, 2, 5, 8}};
    private static final int[] INV = {0, 4, 3, 2, 1, 5, 6, 7, 8, 9};

    private SyntheticPii() {
    }

    public record Person(String name, String email, String phone) {
    }

    public static Person person() {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        String first = FIRST[r.nextInt(FIRST.length)];
        String last = LAST[r.nextInt(LAST.length)];
        String email = (first + "." + last + r.nextInt(10, 9999)).toLowerCase() + "@example.in";
        return new Person(first + " " + last, email, phone());
    }

    public static String phone() {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        StringBuilder sb = new StringBuilder().append(r.nextInt(6, 10));
        for (int i = 0; i < 9; i++) sb.append(r.nextInt(10));
        return sb.toString();
    }

    public static String address() {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        String[] c = CITY[r.nextInt(CITY.length)];
        return r.nextInt(1, 300) + ", " + STREET[r.nextInt(STREET.length)] + ", " + c[0] + ", " + c[1] + " " + c[2]
                + String.format("%03d", r.nextInt(1, 100));
    }

    public static String aadhaar() {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        int[] d = new int[12];
        d[0] = r.nextInt(2, 10);
        for (int i = 1; i < 11; i++) d[i] = r.nextInt(10);
        int c = 0;
        for (int i = 0; i < 11; i++) c = D[c][P[(i + 1) % 8][d[10 - i]]];
        d[11] = INV[c];
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 12; i++) {
            if (i == 4 || i == 8) sb.append(' ');
            sb.append(d[i]);
        }
        return sb.toString();
    }

    /** Marker that starts every demo PII line, so it is never mistaken for real data. */
    public static String demoPrefix(String service, String scenario) {
        String traceId = MDC.get("traceId");
        return "event=demo_debug_dump service=" + service + " demo=true synthetic=true scenario=" + scenario
                + " traceId=" + (traceId == null ? "none" : traceId) + " | ";
    }
}
