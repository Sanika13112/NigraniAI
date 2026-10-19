package com.shopsmart.productservice;

import java.math.BigDecimal;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/** Adds a repeatable starter catalog without changing products already in the database. */
@Component
public class CatalogSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(CatalogSeeder.class);
    private final ProductService productService;

    public CatalogSeeder(ProductService productService) {
        this.productService = productService;
    }

    @Override
    public void run(String... args) {
        catalog().forEach(productService::seedProduct);
        log.info("ShopSmart starter catalog is present (existing products were preserved).");
    }

    private List<Product> catalog() {
        return List.of(
            product("electronics-headphones", "Studio Wireless Headphones", "Comfortable over-ear headphones with clear everyday audio.", 2499, "Electronics", 36, "photo-1505740420928-5e560c06d30e"),
            product("electronics-speaker", "Pocket Bluetooth Speaker", "A compact portable speaker for music at home or on the go.", 1299, "Electronics", 52, "photo-1608043152269-423dbba4e7e1"),
            product("electronics-laptop", "Everyday Laptop", "A lightweight laptop for study, browsing, and daily tasks.", 42999, "Electronics", 14, "photo-1517336714731-489689fd1ca8"),
            product("electronics-tech-kit", "Home Tech Essentials Set", "A curated selection of useful electronics for your workspace.", 3499, "Electronics", 22, "photo-1498049794561-7780e7231661"),

            product("fashion-sneakers", "City Walk Sneakers", "Versatile low-top sneakers designed for comfortable everyday wear.", 1799, "Fashion", 40, "photo-1542291026-7eec264c27ff"),
            product("fashion-handbag", "Everyday Shoulder Bag", "A roomy, easy-to-style shoulder bag for daily essentials.", 1499, "Fashion", 28, "photo-1548036328-c9fa89d128fa"),
            product("fashion-weekend-look", "Weekend Style Edit", "A relaxed fashion edit for casual days and weekend plans.", 2199, "Fashion", 19, "photo-1483985988355-763728e1935b"),
            product("fashion-modern-look", "Modern Layers Collection", "Simple wardrobe layers with an easy, contemporary feel.", 2699, "Fashion", 17, "photo-1529139574466-a303027c1d8b"),

            product("accessories-watch", "Minimal Dial Watch", "A clean, easy-to-pair watch with a timeless dial.", 2199, "Accessories", 31, "photo-1523275335684-37898b6baf30"),
            product("accessories-sunglasses", "Everyday Sunglasses", "Classic sunglasses for bright days and relaxed weekends.", 799, "Accessories", 46, "photo-1511499767150-a48a237f0083"),
            product("accessories-style-edit", "Style Accessories Edit", "A considered accessories collection to finish your everyday look.", 1199, "Accessories", 25, "photo-1611923134239-b9be5816e23c"),
            product("accessories-timepiece", "Classic Everyday Timepiece", "An understated timepiece with a versatile everyday style.", 1899, "Accessories", 18, "photo-1524805444758-089113d48a6d"),

            product("beauty-hydration", "Daily Hydration Skincare Set", "A simple skincare set for a fresh, hydrated daily routine.", 899, "Beauty", 44, "photo-1608248543803-ba4f8c70ae0b"),
            product("beauty-cosmetics", "Everyday Beauty Kit", "A handy selection of beauty essentials for your daily routine.", 1299, "Beauty", 33, "photo-1596462502278-27bfdc403348"),
            product("beauty-skincare", "Gentle Skincare Collection", "A gentle-looking skincare collection for everyday self-care.", 1099, "Beauty", 27, "photo-1608571423902-eed4a5ad8108"),
            product("beauty-fragrance", "Soft Notes Eau de Parfum", "A compact fragrance pick with a soft, everyday feel.", 1599, "Beauty", 21, "photo-1541643600914-78b084683601"),

            product("home-decor", "Sculptural Home Accent", "A warm decorative accent to bring a little character to a room.", 1099, "Home", 23, "photo-1490312278390-ab64016e0aa9"),
            product("home-living", "Calm Living Room Edit", "A soft, considered home edit for a comfortable living space.", 2499, "Home", 12, "photo-1616486338812-3dadae4b4ace"),
            product("home-bedroom", "Bedroom Comfort Set", "Simple home textiles and accents for a restful bedroom.", 1999, "Home", 16, "photo-1505693416388-ac5ce068fe85"),
            product("home-lamp", "Warm Glow Table Lamp", "A decorative lamp that adds a warm touch to an evening corner.", 1699, "Home", 20, "photo-1513519245088-0e12902e5a38"),

            // ---- Expanded catalogue ----
            product("electronics-smartphone", "Smartphone 5G 128GB", "A fast 5G phone with a bright display and all-day battery.", 18999, "Electronics", 25, "photo-1511707171634-5f897ff02aa9"),
            product("electronics-smartwatch", "Smart Fitness Watch", "Tracks steps, heart rate and sleep with a week of battery life.", 3999, "Electronics", 40, "photo-1546868871-7041f2a55e12"),
            product("electronics-earbuds", "True Wireless Earbuds", "Compact earbuds with a charging case and clear calls.", 1999, "Electronics", 60, "photo-1590658268037-6bf12165a8df"),
            product("electronics-tablet", "10-inch Tablet", "A lightweight tablet for streaming, reading and online classes.", 15999, "Electronics", 18, "photo-1544244015-0df4b3ffc6b0"),
            product("electronics-camera", "Mirrorless Camera Kit", "Interchangeable-lens camera with a versatile kit lens.", 54999, "Electronics", 8, "photo-1526170375885-4d8ecf77b99f"),
            product("electronics-over-ear", "Studio Over-Ear Headphones", "Closed-back headphones with deep bass and soft cushions.", 3299, "Electronics", 30, "photo-1583394838336-acd977736f90"),
            product("electronics-keyboard", "Mechanical Keyboard", "Tactile mechanical keys with RGB backlighting.", 2799, "Electronics", 35, "photo-1587829741301-dc798b83add3"),
            product("electronics-monitor", "24-inch Full HD Monitor", "IPS monitor with slim bezels for work and play.", 9999, "Electronics", 15, "photo-1527443224154-c4a3942d3acf"),

            product("fashion-denim-jacket", "Classic Denim Jacket", "A timeless denim jacket that layers over anything.", 2299, "Fashion", 30, "photo-1551028719-00167b16eac5"),
            product("fashion-hoodie", "Soft Fleece Hoodie", "Warm brushed-fleece hoodie with a relaxed fit.", 1499, "Fashion", 45, "photo-1556821840-3a63f95609a7"),
            product("fashion-white-tee", "Essential White T-Shirt", "Breathable cotton tee for everyday wear.", 399, "Fashion", 80, "photo-1521572163474-6864f9cf17ab"),
            product("fashion-running-shoes", "Running Shoes", "Lightweight cushioned shoes for daily runs.", 2999, "Fashion", 35, "photo-1600185365483-26d7a4cc7519"),
            product("fashion-summer-dress", "Summer Floral Dress", "A light, flowy dress for sunny days.", 1799, "Fashion", 22, "photo-1595777457583-95e059d581b8"),
            product("fashion-formal-shirt", "Slim Fit Formal Shirt", "Crisp cotton shirt for office and occasions.", 1199, "Fashion", 40, "photo-1602810318383-e386cc2a3ccf"),
            product("fashion-chinos", "Stretch Chino Trousers", "Comfortable stretch chinos with a smart look.", 1599, "Fashion", 32, "photo-1473966968600-fa801b869a1a"),
            product("fashion-sports-sneakers", "Street Style Sneakers", "Bold everyday sneakers with a cushioned sole.", 2499, "Fashion", 26, "photo-1608231387042-66d1773070a5"),

            product("accessories-backpack", "Everyday Laptop Backpack", "Water-resistant backpack with a padded laptop sleeve.", 1899, "Accessories", 38, "photo-1553062407-98eeb64c6a62"),
            product("accessories-aviators", "Aviator Sunglasses", "UV-protected aviators with a lightweight metal frame.", 1299, "Accessories", 42, "photo-1572635196237-14b3f281503f"),
            product("accessories-leather-belt", "Leather Belt", "Genuine leather belt with a classic buckle.", 699, "Accessories", 50, "photo-1624222247344-550fb60583dc"),
            product("accessories-silver-watch", "Silver Chronograph Watch", "Stainless steel chronograph with a sporty dial.", 4499, "Accessories", 14, "photo-1522312346375-d1a52e2b99b3"),
            product("accessories-cap", "Cotton Baseball Cap", "Adjustable cotton cap for sunny days.", 499, "Accessories", 60, "photo-1588850561407-ed78c282e89b"),
            product("accessories-tote", "Canvas Tote Bag", "Roomy canvas tote for shopping and travel.", 599, "Accessories", 55, "photo-1590874103328-eac38a683ce7"),
            product("accessories-travel-duffel", "Weekend Travel Duffel", "Spacious duffel bag for short trips.", 2199, "Accessories", 20, "photo-1547949003-9792a18a2601"),
            product("accessories-phone-stand", "Smart Phone Stand", "Adjustable aluminium stand for desk and video calls.", 449, "Accessories", 70, "photo-1586953208448-b95a79798f07"),

            product("beauty-perfume", "Signature Eau de Parfum", "A warm, long-lasting fragrance for evenings.", 2499, "Beauty", 24, "photo-1594035910387-fea47794261f"),
            product("beauty-makeup-palette", "Eyeshadow Palette", "Twelve blendable shades from matte to shimmer.", 1199, "Beauty", 30, "photo-1512496015851-a90fb38ba796"),
            product("beauty-lipstick-set", "Matte Lipstick Set", "Three long-wear matte shades in one set.", 899, "Beauty", 40, "photo-1586495777744-4413f21062fa"),
            product("beauty-face-serum", "Vitamin C Face Serum", "Brightening serum for a fresh, even glow.", 749, "Beauty", 50, "photo-1620916566398-39f1143ab7be"),
            product("beauty-sunscreen", "SPF 50 Sunscreen", "Lightweight, non-greasy daily sun protection.", 499, "Beauty", 65, "photo-1556228578-8c89e6adf883"),
            product("beauty-shampoo", "Nourishing Shampoo", "Gentle shampoo for soft, shiny hair.", 399, "Beauty", 70, "photo-1535585209827-a15fcdbc4c2d"),
            product("beauty-skincare-trio", "Skincare Starter Trio", "Cleanser, toner and moisturiser for a simple routine.", 1499, "Beauty", 28, "photo-1571781926291-c477ebfd024b"),
            product("beauty-nail-kit", "Nail Care Kit", "Everything you need for neat, healthy nails.", 549, "Beauty", 36, "photo-1604654894610-df63bc536371"),

            product("home-sofa", "Two-Seater Sofa", "A compact, comfortable sofa for small living rooms.", 18999, "Home", 6, "photo-1555041469-a586c61ea9bc"),
            product("home-armchair", "Accent Armchair", "A cosy armchair with soft upholstery.", 7999, "Home", 10, "photo-1567538096630-e0c55bd6374c"),
            product("home-wall-clock", "Minimal Wall Clock", "A silent-sweep wall clock with a clean face.", 999, "Home", 30, "photo-1563861826100-9cb868fdbe1c"),
            product("home-plant-pot", "Ceramic Plant Pot", "Glazed ceramic pot for indoor plants.", 649, "Home", 45, "photo-1485955900006-10f4d324d411"),
            product("home-cushion-set", "Cushion Cover Set", "Set of two textured cushion covers.", 799, "Home", 40, "photo-1584100936595-c0654b55a2e2"),
            product("home-coffee-mug", "Stoneware Coffee Mugs", "Set of two handmade-style stoneware mugs.", 549, "Home", 60, "photo-1514228742587-6b1558fcca3d"),
            product("home-bedsheet", "Cotton Bedsheet Set", "Soft cotton double bedsheet with pillow covers.", 1299, "Home", 34, "photo-1522771739844-6a9f6d5f14af"),
            product("home-desk-organiser", "Wooden Desk Organiser", "Keeps pens, notes and gadgets tidy.", 899, "Home", 25, "photo-1611269154421-4e27233ac5c7"),

            // ---- New categories ----
            product("sports-yoga-mat", "Non-Slip Yoga Mat", "A 6 mm cushioned mat with a grippy surface for yoga and stretching.", 899, "Sports", 40, "photo-1544367567-0f2fcb009e0b"),
            product("sports-dumbbells", "Adjustable Dumbbell Set", "A pair of adjustable dumbbells for strength training at home.", 3499, "Sports", 15, "photo-1534438327276-14e5300c3a48"),
            product("sports-football", "Training Football, Size 5", "A durable stitched football for practice and weekend matches.", 799, "Sports", 35, "photo-1579952363873-27f3bade9f55"),
            product("sports-basketball", "Outdoor Basketball", "A grippy rubber basketball made for outdoor courts.", 999, "Sports", 30, "photo-1546519638-68e109498ffc"),
            product("sports-bicycle", "City Commuter Bicycle", "A comfortable single-speed bicycle for short city rides.", 12999, "Sports", 6, "photo-1485965120184-e220f721d03e"),
            product("sports-home-gym", "Home Workout Starter Kit", "Skipping rope, grip strengtheners and a mat bag for home workouts.", 1999, "Sports", 20, "photo-1517836357463-d25dfeac3438"),
            product("sports-resistance-bands", "Resistance Band Set", "Five resistance levels for warm-ups, mobility and toning.", 599, "Sports", 50, "photo-1571019613454-1cb2f99b2d8b"),

            product("books-fiction-bundle", "Bestselling Fiction Bundle", "Three popular paperback novels in one bundle.", 899, "Books", 25, "photo-1512820790803-83ca734da794"),
            product("books-classics", "Classic Literature Collection", "A shelf-ready set of timeless classic novels.", 1299, "Books", 18, "photo-1495446815901-a7297e633e8d"),
            product("books-paperback", "Contemporary Paperback Novel", "An easy, absorbing read for your commute or weekend.", 349, "Books", 40, "photo-1544947950-fa07a98d237f"),
            product("books-self-improvement", "Self-Improvement Reading Set", "Four non-fiction titles on habits, focus and money.", 1099, "Books", 22, "photo-1481627834876-b7833e8f5570"),
            product("books-notebook", "Hardcover Ruled Notebook", "A 200-page A5 notebook with thick, smooth paper.", 299, "Books", 70, "photo-1531346878377-a5be20888e57"),
            product("books-watercolour", "Watercolour Paint Set", "Twenty-four vivid colours with two brushes.", 699, "Books", 30, "photo-1513475382585-d06e58bcb0e0"),
            product("books-study-kit", "Student Study Kit", "Pens, highlighters, sticky notes and a pencil case.", 549, "Books", 45, "photo-1503676260728-1c00da094a0b"),

            product("kitchen-pour-over", "Pour-Over Coffee Set", "A glass dripper and carafe for fresh, slow-brewed coffee.", 1499, "Kitchen", 20, "photo-1495474472287-4d71bcdd2085"),
            product("kitchen-cookware", "Non-Stick Cookware Set", "Three-piece non-stick set: frying pan, kadai and saucepan.", 3999, "Kitchen", 12, "photo-1556909114-f6e7ad7d3136"),
            product("kitchen-utensils", "Kitchen Utensil Set", "Heat-resistant spatulas, ladles and tongs with a stand.", 999, "Kitchen", 35, "photo-1556911220-bff31c812dba"),
            product("kitchen-chef-kit", "Home Chef Essentials Kit", "Chopping board, knife, peeler and measuring cups.", 1799, "Kitchen", 18, "photo-1556910103-1c02745aae4d"),
            product("kitchen-espresso-cups", "Ceramic Espresso Cups", "A set of two ceramic cups with saucers.", 499, "Kitchen", 40, "photo-1509042239860-f550ce710b93"),

            product("grocery-fruit-basket", "Seasonal Fruit Basket", "A mixed basket of fresh seasonal fruit, about 2 kg.", 599, "Grocery", 25, "photo-1610832958506-aa56368176cf"),
            product("grocery-vegetable-box", "Fresh Vegetable Box", "A weekly box of everyday vegetables, about 3 kg.", 449, "Grocery", 30, "photo-1542838132-92c53300491e"),
            product("grocery-olive-oil", "Extra Virgin Olive Oil, 1 L", "Cold-pressed olive oil for salads and light cooking.", 899, "Grocery", 40, "photo-1474979266404-7eaacbcd87c5"),
            product("grocery-honey", "Raw Forest Honey, 500 g", "Unprocessed honey in a glass jar.", 399, "Grocery", 50, "photo-1587049352846-4a222e784d38"),
            product("grocery-basmati", "Basmati Rice, 5 kg", "Long-grain aged basmati rice for everyday meals.", 749, "Grocery", 35, "photo-1586201375761-83865001e31c"),
            product("grocery-tea", "Assam Tea, 500 g", "Strong, malty loose-leaf tea for a morning chai.", 299, "Grocery", 60, "photo-1556679343-c7306c1976bc"),
            product("grocery-bread", "Whole Wheat Bread", "A soft 400 g loaf baked with whole wheat flour.", 59, "Grocery", 40, "photo-1509440159596-0249088772ff"),
            product("grocery-cookies", "Butter Cookies Tin", "Crisp butter cookies in a 400 g gift tin.", 249, "Grocery", 45, "photo-1558961363-fa8fdf82db35"),

            product("toys-building-bricks", "Building Bricks Set, 500 pcs", "Colourful interlocking bricks for creative building, ages 5+.", 1499, "Toys", 25, "photo-1587654780291-39c9404d746b"),
            product("toys-baby-gift", "Baby Care Gift Set", "Soft cotton essentials for newborns in a gift box.", 1299, "Toys", 20, "photo-1515488042361-ee00e0ddd4e4"),
            product("toys-wooden-learning", "Wooden Learning Toys", "Stacking and sorting toys for early learning, ages 2+.", 899, "Toys", 30, "photo-1596461404969-9ae70f2830c1"),
            product("toys-art-craft", "Kids Art and Craft Kit", "Crayons, paints, paper and stickers for creative play.", 649, "Toys", 35, "photo-1452860606245-08befc0ff44b"),

            productWithImage("legacy-wireless-mouse", "Wireless Mouse", "Electronics", "A responsive wireless mouse for everyday work and browsing.", 699, 45,
                    "https://images.unsplash.com/photo-1707592691247-5c3a1c7ba0e3?auto=format&blend=000000&blend-alpha=10&blend-mode=normal&blend-w=1&crop=faces%2Cedges&fit=crop&h=630&ixid=M3wxMjA3fDB8MXxhbGx8fHx8fHx8fHwxNzM5NDcyNzQzfA&ixlib=rb-4.0.3&q=60&w=1200"),
            productWithImage("legacy-cotton-tshirt", "Cotton T-Shirt", "Fashion", "A soft cotton T-shirt made for comfortable everyday wear.", 499, 30,
                    "https://images.unsplash.com/photo-1618677603544-51162346e165?auto=format&fit=crop&fm=jpg&ixid=NHwxMjA3fDA%3D&ixlib=rb-4.1.0&q=60&w=3000"),
            productWithImage("legacy-leather-wallet", "Leather Wallet", "Accessories", "A classic brown leather wallet with practical card storage.", 799, 20,
                    "https://images.unsplash.com/photo-1677694666910-0d61253494c4?auto=format&blend=000000&blend-alpha=10&blend-mode=normal&blend-w=1&crop=faces%2Cedges&fit=crop&h=630&ixid=M3wxMjA3fDB8MXxhbGx8fHx8fHx8fHwxNzE5NzMzMjcwfA&ixlib=rb-4.0.3&q=60&w=1200"),
            productWithImage("legacy-daily-moisturizer", "Daily Moisturizer", "Beauty", "A lightweight daily moisturizer for a simple skincare routine.", 349, 40,
                    "https://images.unsplash.com/photo-1771053393647-a8c75798f58d?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000"),
            productWithImage("legacy-modern-table-lamp", "Modern Table Lamp", "Home", "A minimal table lamp for a bedroom or desk.", 999, 15,
                    "https://images.unsplash.com/photo-1622127922040-13cab637ee78?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000"),
            productWithImage("legacy-bluetooth-headphones", "Bluetooth Headphones Pro", "Electronics", "Wireless Bluetooth headphones for everyday listening.", 1999, 25,
                    "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=60&w=1200")
        );
    }

    private Product product(String seedKey, String name, String description, double price,
                            String category, int stock, String unsplashPhotoId) {
        Product product = new Product(name, description, BigDecimal.valueOf(price).setScale(2), category, stock,
                "https://images.unsplash.com/" + unsplashPhotoId + "?auto=format&fit=crop&w=700&q=85&ixlib=rb-4.1.0");
        product.setSeedKey(seedKey);
        return product;
    }

    private Product productWithImage(String seedKey, String name, String category, String description,
                                     double price, int stock, String imageUrl) {
        Product product = new Product(name, description, BigDecimal.valueOf(price).setScale(2), category, stock, imageUrl);
        product.setSeedKey(seedKey);
        return product;
    }
}
