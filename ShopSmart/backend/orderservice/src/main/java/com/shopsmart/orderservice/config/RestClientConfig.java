package com.shopsmart.orderservice.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

import com.shopsmart.orderservice.security.InternalClients;

@Configuration
public class RestClientConfig {

    @Bean
    public RestClient productRestClient(
            @Value("${product.service.url}") String url,
            @Value("${shopsmart.security.internal-api-key:}") String internalKey) {
        return InternalClients.create(url, internalKey);
    }

    @Bean
    public RestClient notificationRestClient(
            @Value("${notification.service.url}") String url,
            @Value("${shopsmart.security.internal-api-key:}") String internalKey) {
        return InternalClients.create(url, internalKey);
    }

    @Bean
    public RestClient paymentRestClient(
            @Value("${payment.service.url}") String url,
            @Value("${shopsmart.security.internal-api-key:}") String internalKey) {
        return InternalClients.create(url, internalKey);
    }
}
