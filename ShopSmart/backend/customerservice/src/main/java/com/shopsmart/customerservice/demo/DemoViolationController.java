package com.shopsmart.customerservice.demo;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.shopsmart.customerservice.security.ApiException;
import com.shopsmart.customerservice.security.AuthPrincipal;
import com.shopsmart.customerservice.security.RequestAuth;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Admin-only control of the demo violation switches. Every change is logged as a demo event
 * with the admin who made it, and recorded in the answer key.
 */
@RestController
public class DemoViolationController {

    public static final String PATH = "/customers/admin/demo-violations";
    private static final Logger log = LoggerFactory.getLogger(DemoViolationController.class);

    private final DemoSwitches switches;
    private final GroundTruth groundTruth;
    private final RequestAuth auth;

    public DemoViolationController(DemoSwitches switches, GroundTruth groundTruth, RequestAuth auth) {
        this.switches = switches;
        this.groundTruth = groundTruth;
        this.auth = auth;
    }

    @GetMapping(PATH)
    public List<Map<String, Object>> list(HttpServletRequest request) {
        auth.requireAdmin(request);
        return switches.list();
    }

    @PutMapping(PATH + "/{name}")
    public Map<String, Object> set(HttpServletRequest request, @PathVariable String name,
                                   @RequestBody Map<String, Object> body) {
        AuthPrincipal admin = auth.requireAdmin(request);
        if (!DemoSwitches.ALL.contains(name)) {
            throw ApiException.notFound("Unknown demo switch");
        }
        Object enabled = body == null ? null : body.get("enabled");
        if (!(enabled instanceof Boolean on)) {
            throw ApiException.badRequest("enabled must be true or false");
        }
        if (on && !switches.allowed()) {
            throw ApiException.forbidden("Demo violations are disabled on this deployment (DEMO_VIOLATIONS_ALLOWED=false)");
        }
        switches.set(name, on);
        log.info("event=demo_scenario_changed service=customer-service traceId={} scenario={} enabled={} actor=admin:{} demo=true",
                MDC.get("traceId"), name, on, admin.userId());
        groundTruth.record(on ? "SCENARIO_STARTED" : "SCENARIO_STOPPED", List.of(), "switch:" + name,
                "none", "demo-harness", null, (on ? "Turned on by admin:" : "Turned off by admin:") + admin.userId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", name);
        out.put("enabled", on);
        return out;
    }
}
