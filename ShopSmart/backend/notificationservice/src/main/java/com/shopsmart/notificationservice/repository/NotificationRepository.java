package com.shopsmart.notificationservice.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.shopsmart.notificationservice.entity.Notification;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByRecipientIdOrderByCreatedAtDesc(Long recipientId, Pageable pageable);

    long countByRecipientIdAndStatus(Long recipientId, String status);

    Optional<Notification> findByIdAndRecipientId(Long id, Long recipientId);

    List<Notification> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @Modifying
    @Query("update Notification n set n.status = 'READ' where n.recipientId = :recipientId and n.status = 'UNREAD'")
    int markAllRead(@Param("recipientId") Long recipientId);
}
