class_name ObjectPool
extends RefCounted
## Reuses nodes that spawn repeatedly (GAME_DESIGN.md sections 9 and 14). Pooled nodes stay in
## the tree under `parent`; release() calls the node's reset() and hides it, and acquire() hands
## out a hidden node (or a new one from `factory`) made visible again.

var created := 0

var _factory: Callable
var _parent: Node
var _free: Array[CanvasItem] = []


## `factory` returns a new CanvasItem that has a reset() method.
func _init(factory: Callable, parent: Node) -> void:
	_factory = factory
	_parent = parent


func prewarm(count: int) -> void:
	for i in count:
		_free.push_back(_create())


func acquire() -> CanvasItem:
	var item: CanvasItem = _create() if _free.is_empty() else _free.pop_back()
	item.visible = true
	return item


func release(item: CanvasItem) -> void:
	item.call(&"reset")
	item.visible = false
	_free.push_back(item)


func free_count() -> int:
	return _free.size()


func _create() -> CanvasItem:
	var item: CanvasItem = _factory.call()
	item.visible = false
	_parent.add_child(item)
	created += 1
	return item
