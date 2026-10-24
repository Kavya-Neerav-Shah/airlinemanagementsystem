from flask import Flask, request, jsonify
from flask_cors import CORS
from neo4j import GraphDatabase

app = Flask(__name__)
CORS(app)

# Neo4j database connection settings
URI = "neo4j://127.0.0.1:7687"
USER = "neo4j"
PASSWORD = "12345678"



def run_query(query, parameters=None):
    with GraphDatabase.driver(
        URI,
        auth=(USER, PASSWORD)
    ) as driver:
        with driver.session(database="neo4j") as session:
            result = session.run(query, parameters or {})
            return [record.data() for record in result]



@app.route('/api/cities', methods=['GET'])
def get_cities():
    query = "MATCH (c:City) RETURN c.name AS name ORDER BY c.name"
    try:
        results = run_query(query)
        cities = [row["name"] for row in results if row.get("name")]
        return jsonify(cities)
    except Exception as e:
        return jsonify(["Delhi", "Mumbai", "Chennai", "Bengaluru"])


@app.route('/api/flights', methods=['GET'])
def get_flights():
    from_city = (
        request.args.get("from")
        or request.args.get("departure")
        or request.args.get("source")
    )
    to_city = (
        request.args.get("to")
        or request.args.get("arrival")
        or request.args.get("destination")
    )

    travel_date = (
        request.args.get("date")
        or request.args.get("travelDate")
        or request.args.get("departureDate")
        or request.args.get("travel_date")
        or request.args.get("day")
    )

    if not travel_date:
        travel_date = "24-10-2026"

    query = """
    MATCH (source:City)-[f:FLIGHT_TO]->(target:City)
    WHERE ($from IS NULL OR $from = '' OR source.name = $from)
      AND ($to IS NULL OR $to = '' OR target.name = $to)
    RETURN source.name AS departureCity, 
           target.name AS arrivalCity, 
           f.flightNumber AS flightNumber, 
           f.departureTime AS departureTime, 
           f.arrivalTime AS arrivalTime, 
           f.price AS price
    """

    try:
        results = run_query(query, {"from": from_city, "to": to_city})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    flights = []
    for row in results:
        city_from = row.get("departureCity")
        city_to = row.get("arrivalCity")
        flights.append({
    "flightno": row.get("flightNumber"),
    "flightNumber": row.get("flightNumber"),
    "departureCity": city_from,
            "arrivalCity": city_to,
            "from": city_from,
            "to": city_to,
            "origin": city_from,
            "destination": city_to,
            "departure": city_from,
            "arrival": city_to,
            "departureTime": row.get("departureTime"),
            "arrivalTime": row.get("arrivalTime"),
            "date": travel_date,
            "travelDate": travel_date,
            "departureDate": travel_date,
            "price": row.get("price"),
        })

    return jsonify(flights)

# ---------- BOOKING AND SEAT APIs ----------

def get_booking_ticket(booking_id):
    query = """
    MATCH (b:Booking {booking_id: $booking_id})-[:BOOKED_BY]->(p:Passenger)
    MATCH (b)-[:FOR_FLIGHT]->(f:Flight)
    MATCH (b)-[:BOOKED_SEAT]->(s:Seat)

    OPTIONAL MATCH (source:City)-[r:FLIGHT_TO]->(target:City)
    WHERE r.flightNumber = f.flightno

    OPTIONAL MATCH (c:Crew)-[:ASSIGNED_TO]->(f)

    RETURN b.booking_id AS booking_id,
           p.passengername AS passenger_name,
           p.email AS email,
           f.flightno AS flight_no,
           coalesce(source.name, "Unknown") AS origin,
           coalesce(target.name, "Unknown") AS destination,
           coalesce(f.departuretime, r.departureTime, "—") AS departure,
           coalesce(f.arrivaltime, r.arrivalTime, "—") AS arrival,
           f.flightdate AS date,
           s.seatno AS seat_no,
           s.class AS seat_class,
           coalesce(b.price, s.price, 0) AS price,
           collect(DISTINCT CASE
               WHEN c IS NULL THEN null
               ELSE {name: c.name, role: c.role}
           END) AS crew
    """
    rows = run_query(query, {"booking_id": booking_id})
    return rows[0] if rows else None


@app.route("/api/flights/<flight_no>/seats", methods=["GET"])
def get_flight_seats(flight_no):
    query = """
    MATCH (f:Flight {flightno: $flight_no})-[:HAS_SEAT]->(s:Seat)
    RETURN s.seatno AS seatno,
           s.class AS class,
           s.price AS price,
           coalesce(s.isAvailable, true) AS is_available
    ORDER BY s.seatno
    """
    try:
        return jsonify(run_query(query, {"flight_no": flight_no}))
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.route("/api/book", methods=["POST"])
def book_seat():
    data = request.get_json(silent=True) or {}
    passenger_id = str(data.get("passenger_id", "")).strip()
    flight_no = str(data.get("flight_no", "")).strip()
    seat_no = str(data.get("seat_no", "")).strip()

    if not passenger_id or not flight_no or not seat_no:
        return jsonify({
            "status": "error",
            "message": "Passenger ID, flight number and seat number are required."
        }), 400

    query = """
    MATCH (p:Passenger {passengerid: toInteger($passenger_id)})
    MATCH (f:Flight {flightno: $flight_no})-[:HAS_SEAT]->(s:Seat {seatno: $seat_no})

    // Lock the seat before checking its availability.
    SET s._booking_lock = randomUUID()
WITH p, f, s, coalesce(s.isAvailable, true) AS available
REMOVE s._booking_lock
WITH p, f, s, available
WHERE available = true
SET s.isAvailable = false

    CREATE (b:Booking {
        booking_id: randomUUID(),
        status: "CONFIRMED",
        created_at: datetime(),
        price: s.price
    })
    CREATE (b)-[:BOOKED_BY]->(p)
    CREATE (b)-[:FOR_FLIGHT]->(f)
    CREATE (b)-[:BOOKED_SEAT]->(s)

    RETURN b.booking_id AS booking_id
    """

    try:
        rows = run_query(query, {
            "passenger_id": passenger_id,
            "flight_no": flight_no,
            "seat_no": seat_no
        })

        if not rows:
            return jsonify({
                "status": "error",
                "message": (
                    "Passenger not found, flight or seat not found, "
                    "or this seat is already booked."
                )
            }), 409

        ticket = get_booking_ticket(rows[0]["booking_id"])
        if not ticket:
            return jsonify({
                "status": "error",
                "message": "Booking was saved, but ticket details could not be loaded."
            }), 500

        return jsonify({
            "status": "success",
            "message": "Booking confirmed.",
            "ticket": ticket
        }), 201

    except Exception as e:
        app.logger.exception("Booking failed")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/api/bookings/<passenger_id>", methods=["GET"])
def get_bookings(passenger_id):
    query = """
    MATCH (p:Passenger {passengerid: $passenger_id})-[:BOOKED_BY]-(b:Booking)
    MATCH (b)-[:FOR_FLIGHT]-(f:Flight)
    MATCH (b)-[:BOOKED_SEAT]-(s:Seat)
    OPTIONAL MATCH (f)-[:DEPARTS_FROM]->(origin:City)
    OPTIONAL MATCH (f)-[:ARRIVES_AT]->(destination:City)
    RETURN b, f, s, origin, destination
    ORDER BY b.bookingdate DESC
    """

    records = run_query(query, {"passenger_id": int(passenger_id)})

    tickets = []

    for record in records:
        booking = record["b"]
        flight = record["f"]
        seat = record["s"]
        origin = record["origin"]
        destination = record["destination"]

        tickets.append({
            "booking_id": booking.get("bookingid"),
            "status": booking.get("status", "CONFIRMED"),
            "flight_no": flight.get("flightno"),
            "origin": origin.get("cityname") if origin else "N/A",
            "destination": destination.get("cityname") if destination else "N/A",
            "seat_no": seat.get("seatno"),
            "seat_class": seat.get("class"),
            "price": booking.get("price"),
            "date": flight.get("flightdate"),
        })

    return jsonify({
        "status": "success",
        "tickets": tickets
    })


@app.route("/api/cancel", methods=["POST"])
def cancel_booking():
    data = request.get_json(silent=True) or {}
    passenger_id = str(data.get("passenger_id", "")).strip()
    flight_no = str(data.get("flight_no", "")).strip()
    seat_no = str(data.get("seat_no", "")).strip()

    if not passenger_id or not flight_no or not seat_no:
        return jsonify({
            "status": "error",
            "message": "Passenger ID, flight number and seat number are required."
        }), 400

    query = """
    MATCH (b:Booking)-[:BOOKED_BY]->
          (p:Passenger {passengerid: toInteger($passenger_id)})
    MATCH (b)-[:FOR_FLIGHT]->(f:Flight {flightno: $flight_no})
    MATCH (b)-[:BOOKED_SEAT]->(s:Seat {seatno: $seat_no})
    WITH b, s
WHERE b.status = "CONFIRMED"
WITH b, s
ORDER BY b.created_at DESC
LIMIT 1

SET b.status = "CANCELLED",
    b.cancelled_at = datetime(),
    s.isAvailable = true

RETURN coalesce(b.price, s.price, 0) AS paid_amount
    """

    try:
        rows = run_query(query, {
            "passenger_id": passenger_id,
            "flight_no": flight_no,
            "seat_no": seat_no
        })

        if not rows:
            return jsonify({
                "status": "error",
                "message": "No matching confirmed booking was found."
            }), 404

        paid_amount = float(rows[0]["paid_amount"] or 0)
        cancellation_fee = round(paid_amount * 0.10, 2)
        refund_amount = round(paid_amount - cancellation_fee, 2)

        return jsonify({
            "status": "success",
            "message": "Booking cancelled successfully.",
            "paid_amount": paid_amount,
            "cancellation_fee": cancellation_fee,
            "refund_amount": refund_amount
        })

    except Exception as e:
        app.logger.exception("Cancellation failed")
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)