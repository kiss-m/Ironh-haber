extends GutTest
## ObjectPool reuse, reset and prewarming.


class Pooled:
	extends Node2D
	var resets := 0

	func reset() -> void:
		resets += 1


var parent: Node2D


func before_each() -> void:
	parent = add_child_autofree(Node2D.new())


func test_released_items_are_reset_hidden_and_reused() -> void:
	var pool := ObjectPool.new(func() -> Pooled: return Pooled.new(), parent)
	var first: Pooled = pool.acquire()
	assert_true(first.visible)
	pool.release(first)
	assert_eq(first.resets, 1)
	assert_false(first.visible)
	assert_same(pool.acquire(), first)
	assert_eq(pool.created, 1)


func test_prewarm_creates_hidden_children() -> void:
	var pool := ObjectPool.new(func() -> Pooled: return Pooled.new(), parent)
	pool.prewarm(5)
	assert_eq(pool.free_count(), 5)
	assert_eq(parent.get_child_count(), 5)
	for child in parent.get_children():
		assert_false((child as Pooled).visible)
	pool.acquire()
	assert_eq(pool.created, 5, "acquire after prewarm does not create")
