# frozen_string_literal: true

require "async/websocket/adapters/rack"
require "async/queue"
require "json"
require "securerandom"

# Room state: { room_id => { peers: Hash[connection => { queue:, user_id: }], state: Hash, presences: Hash[userId => presence] } }
ROOMS = {}

def get_room(room_id)
	ROOMS[room_id] ||= { peers: {}, state: {}, presences: {} }
end

def join_room(room_id, connection, queue)
	room = get_room(room_id)
	room[:peers][connection] = { queue: queue, user_id: nil }

	# Send current room state as snapshot via the queue
	unless room[:state].empty?
		snapshot = JSON.generate({ type: "snapshot", records: room[:state] })
		queue.enqueue(snapshot)
	end

	# Send all current peer presences
	unless room[:presences].empty?
		msg = JSON.generate({ type: "peer_presences", presences: room[:presences] })
		queue.enqueue(msg)
	end
end

def leave_room(room_id, connection)
	return unless ROOMS[room_id]

	peer = ROOMS[room_id][:peers].delete(connection)

	if peer && peer[:user_id]
		user_id = peer[:user_id]
		ROOMS[room_id][:presences].delete(user_id)

		# Broadcast leave to remaining peers
		leave_msg = JSON.generate({ type: "leave", userId: user_id })
		ROOMS[room_id][:peers].each do |_conn, p|
			p[:queue].enqueue(leave_msg)
		end
	end

	# Clean up empty rooms
	if ROOMS[room_id][:peers].empty?
		ROOMS.delete(room_id)
	end
end

def broadcast(room_id, sender, raw_message)
	return unless ROOMS[room_id]

	ROOMS[room_id][:peers].each do |conn, peer|
		next if conn == sender
		peer[:queue].enqueue(raw_message)
	end
end

def update_room_state(room_id, data)
	room = get_room(room_id)
	changes = data["changes"]
	return unless changes

	# Apply added records
	if changes["added"]
		changes["added"].each do |id, record|
			room[:state][id] = record
		end
	end

	# Apply updated records
	if changes["updated"]
		changes["updated"].each do |id, pair|
			# pair is [old, new] — take the new value
			room[:state][id] = pair.last
		end
	end

	# Apply removed records
	if changes["removed"]
		changes["removed"].each do |id, _record|
			room[:state].delete(id)
		end
	end
end

# Serve static files from public/
static_files = Rack::Files.new("public")

# Read index.html once for SPA serving
INDEX_HTML_PATH = File.join(__dir__, "public", "index.html")

run do |env|
	path = env["PATH_INFO"]

	# WebSocket endpoint: /ws/<room_id>
	if path =~ %r{\A/ws/(.+)\z}
		room_id = $1

		Async::WebSocket::Adapters::Rack.open(env) do |connection|
			queue = Async::Queue.new
			join_room(room_id, connection, queue)

			# Writer fiber: dequeues messages and sends them to this connection
			writer_task = Async do
				while raw = queue.dequeue
					message = Protocol::WebSocket::TextMessage.new(raw)
					connection.write(message)
					connection.flush if queue.empty?
				end
			end

			begin
				while message = connection.read
					raw = message.to_str
					data = JSON.parse(raw)

					if data["type"] == "presence"
						# Store presence and track userId for this connection
						user_id = data["userId"]
						room = get_room(room_id)
						room[:peers][connection][:user_id] = user_id
						room[:presences][user_id] = data["presence"]
						broadcast(room_id, connection, raw)
					else
						update_room_state(room_id, data)
						broadcast(room_id, connection, raw)
					end
				end
			ensure
				leave_room(room_id, connection)
				writer_task&.stop
			end
		end or [400, {}, ["WebSocket upgrade required"]]

	# Root redirect to random room
	elsif path == "/" || path == ""
		room_id = SecureRandom.hex(4)
		[302, { "location" => "/room/#{room_id}" }, []]

	# SPA route: /room/*
	elsif path =~ %r{\A/room/}
		if File.exist?(INDEX_HTML_PATH)
			body = File.read(INDEX_HTML_PATH)
			[200, { "content-type" => "text/html; charset=utf-8" }, [body]]
		else
			[404, { "content-type" => "text/plain" }, ["Frontend not built. Run: cd frontend && npm install && npm run build"]]
		end

	# Static files
	else
		static_files.call(env)
	end
end
