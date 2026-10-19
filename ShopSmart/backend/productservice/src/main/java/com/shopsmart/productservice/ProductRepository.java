package com.shopsmart.productservice;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, Long> {

    Optional<Product> findBySeedKey(String seedKey);

    Optional<Product> findByNameIgnoreCaseAndCategoryIgnoreCase(String name, String category);

    List<Product> findByStockQuantityLessThanEqualOrderByStockQuantityAsc(int threshold);

    /** Decrements only when enough stock exists, so stock can never go negative. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Product p set p.stockQuantity = p.stockQuantity - :quantity "
            + "where p.id = :id and p.stockQuantity >= :quantity")
    int decrementIfAvailable(@Param("id") Long id, @Param("quantity") int quantity);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Product p set p.stockQuantity = p.stockQuantity + :quantity where p.id = :id")
    int increment(@Param("id") Long id, @Param("quantity") int quantity);

    @Query("select p from Product p where "
            + "(:q is null or lower(p.name) like :q or lower(p.description) like :q or lower(p.category) like :q) "
            + "and (:category is null or p.category = :category) "
            + "and (:minPrice is null or p.price >= :minPrice) "
            + "and (:maxPrice is null or p.price <= :maxPrice) "
            + "and (:inStockOnly = false or p.stockQuantity > 0)")
    Page<Product> search(
            @Param("q") String q,
            @Param("category") String category,
            @Param("minPrice") BigDecimal minPrice,
            @Param("maxPrice") BigDecimal maxPrice,
            @Param("inStockOnly") boolean inStockOnly,
            Pageable pageable);

    /** Short queries (1-2 letters) match the start of the name, any word in the name, or the category. */
    @Query("select p from Product p where "
            + "(lower(p.name) like :starts or lower(p.name) like :wordStarts or lower(p.category) like :starts) "
            + "and (:category is null or p.category = :category) "
            + "and (:minPrice is null or p.price >= :minPrice) "
            + "and (:maxPrice is null or p.price <= :maxPrice) "
            + "and (:inStockOnly = false or p.stockQuantity > 0)")
    Page<Product> searchByPrefix(
            @Param("starts") String starts,
            @Param("wordStarts") String wordStarts,
            @Param("category") String category,
            @Param("minPrice") BigDecimal minPrice,
            @Param("maxPrice") BigDecimal maxPrice,
            @Param("inStockOnly") boolean inStockOnly,
            Pageable pageable);
}
