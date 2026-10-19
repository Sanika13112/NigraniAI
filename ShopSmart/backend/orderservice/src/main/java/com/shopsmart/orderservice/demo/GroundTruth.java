package com.shopsmart.orderservice.demo;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Answer key for the compliance agent. Every violation the demo switches inject is recorded here,
 * one JSON object per line, in logs/ground-truth/<service>.jsonl (never in the normal logs).
 * messageSha256 is the SHA-256 of the exact log message, so a label can be matched to its line.
 */
@Component
public class GroundTruth {

    private static final Logger TRUTH = LoggerFactory.getLogger("com.shopsmart.orderservice.demo.groundtruth");

    private final String service;

    public GroundTruth(@Value("${spring.application.name:unknown-service}") String service) {
        this.service = service;
    }

    public void record(String violationType, List<String> piiTypes, String subjectRef,
                       String logStream, String loggerName, String loggedMessage, String detail) {
        try {
            String traceId = MDC.get("traceId");
            StringBuilder json = new StringBuilder(256).append('{');
            field(json, "id", UUID.randomUUID().toString()).append(',');
            field(json, "recordedAt", Instant.now().toString()).append(',');
            field(json, "service", service).append(',');
            field(json, "violationType", violationType).append(',');
            json.append("\"piiTypes\":[");
            for (int i = 0; i < piiTypes.size(); i++) {
                if (i > 0) json.append(',');
                json.append('"').append(escape(piiTypes.get(i))).append('"');
            }
            json.append("],");
            field(json, "traceId", traceId == null ? "none" : traceId).append(',');
            field(json, "subjectRef", subjectRef).append(',');
            field(json, "logStream", logStream).append(',');
            field(json, "logger", loggerName).append(',');
            field(json, "messageSha256", loggedMessage == null ? null : sha256(loggedMessage)).append(',');
            field(json, "detail", detail);
            json.append('}');
            TRUTH.info(json.toString());
        } catch (RuntimeException ignored) {
            // The answer key must never break the request it describes.
        }
    }

    public static String sha256(String text) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static StringBuilder field(StringBuilder json, String name, String value) {
        json.append('"').append(name).append("\":");
        if (value == null) {
            return json.append("null");
        }
        return json.append('"').append(escape(value)).append('"');
    }

    private static String escape(String s) {
        StringBuilder out = new StringBuilder(s.length() + 8);
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        return out.toString();
    }
}
