package com.shopsmart.orderservice.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

@Embeddable
public class StatusChange {

    @Column(nullable = false, length = 30)
    private String status;

    @Column(length = 300)
    private String note;

    @Column(length = 40)
    private String actor;

    @Column(nullable = false)
    private Instant changedAt;

    public StatusChange() {
    }

    public StatusChange(String status, String note, String actor) {
        this.status = status;
        this.note = note;
        this.actor = actor;
        this.changedAt = Instant.now();
    }

    public String getStatus() { return status; }
    public String getNote() { return note; }
    public String getActor() { return actor; }
    public Instant getChangedAt() { return changedAt; }
}
