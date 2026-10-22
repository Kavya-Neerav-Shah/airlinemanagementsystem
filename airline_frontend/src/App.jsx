import React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Plane, Search, ArrowLeftRight, CalendarDays, MapPin, Clock3, Users,
  ChevronRight, CheckCircle2, AlertCircle, LoaderCircle, Armchair,
  Ticket, XCircle, RefreshCw, Luggage, ShieldCheck, Menu
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function money(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(number)
    : "Price unavailable";
}
function prettyDate(value) {
  if (!value) return "Date not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function normalizeFlight(f) {
  return {
    ...f,
    flightno: String(f.flightno ?? ""),
    origin: f.origin ?? "Unknown",
    destination: f.destination ?? "Unknown",
    departure: f.departure ?? "—",
    arrival: f.arrival ?? "—",
  };
}

export default function App() {
  const [flights, setFlights] = useState([]);
  const [loadingFlights, setLoadingFlights] = useState(true);
  const [apiError, setApiError] = useState("");
  const [originFilter, setOriginFilter] = useState("");
  const [destinationFilter, setDestinationFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedFlight, setSelectedFlight] = useState(null);
  const [seats, setSeats] = useState([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [seatError, setSeatError] = useState("");
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [passengerId, setPassengerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [ticketData, setTicketData] = useState(null);
  const [activeTab, setActiveTab] = useState("search");
  const [cancelPassengerId, setCancelPassengerId] = useState("");
  const [cancelFlightNo, setCancelFlightNo] = useState("");
  const [cancelSeatNo, setCancelSeatNo] = useState("");
  const [cancelResult, setCancelResult] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);

  async function loadFlights() {
    setLoadingFlights(true);
    setApiError("");
    try {
      const response = await fetch(`${API_BASE}/api/flights`);
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Unexpected response from /api/flights");
      setFlights(data.map(normalizeFlight));
    } catch (error) {
      setApiError(`Couldn't load flights. Make sure the Flask backend and Neo4j are running. (${error.message})`);
    } finally {
      setLoadingFlights(false);
    }
  }

  useEffect(() => { loadFlights(); }, []);

  const airports = useMemo(() => {
    const cities = new Set();
    flights.forEach(f => { if (f.origin) cities.add(f.origin); if (f.destination) cities.add(f.destination); });
    return [...cities].sort((a, b) => String(a).localeCompare(String(b)));
  }, [flights]);

  const filteredFlights = useMemo(() => flights.filter(f => {
    const originMatch = !originFilter || String(f.origin).toLowerCase().includes(originFilter.toLowerCase());
    const destinationMatch = !destinationFilter || String(f.destination).toLowerCase().includes(destinationFilter.toLowerCase());
    const dateMatch = !dateFilter || String(f.date ?? "").slice(0, 10) === dateFilter;
    return originMatch && destinationMatch && dateMatch;
  }), [flights, originFilter, destinationFilter, dateFilter]);

  async function chooseFlight(flight) {
    setSelectedFlight(flight);
    setSelectedSeat(null);
    setSeats([]);
    setSeatError("");
    setNotice(null);
    setTicketData(null);
    setLoadingSeats(true);
    try {
      const response = await fetch(`${API_BASE}/api/flights/${encodeURIComponent(flight.flightno)}/seats`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned ${response.status}`);
      setSeats(Array.isArray(data) ? data : []);
      if (!data.length) setSeatError("No seats were returned for this flight.");
    } catch (error) {
      setSeatError(`Couldn't load seats. ${error.message}`);
    } finally {
      setLoadingSeats(false);
    }
  }

  async function bookSeat(event) {
    event.preventDefault();
    if (!selectedFlight || !selectedSeat || !passengerId.trim()) {
      setNotice({ type: "error", text: "Enter your passenger ID and select an available seat." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`${API_BASE}/api/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passenger_id: passengerId.trim(),
          flight_no: selectedFlight.flightno,
          seat_no: selectedSeat.seatno
        })
      });
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.message || "Booking could not be completed.");
      setTicketData(data.ticket);
      setNotice({ type: "success", text: "Your seat has been booked successfully." });
      await chooseFlight(selectedFlight);
      setActiveTab("ticket");
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function cancelBooking(event) {
    event.preventDefault();
    setBusy(true);
    setCancelResult(null);
    setNotice(null);
    try {
      const response = await fetch(`${API_BASE}/api/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passenger_id: cancelPassengerId.trim(),
          flight_no: cancelFlightNo.trim(),
          seat_no: cancelSeatNo.trim()
        })
      });
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.message || "Cancellation failed.");
      setCancelResult(data);
      setNotice({ type: "success", text: data.message || "Booking cancelled." });
      await loadFlights();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  function resetSearch() {
    setOriginFilter(""); setDestinationFilter(""); setDateFilter("");
  }

  const isAvailable = value => value === true || value === 1 || String(value).toLowerCase() === "true";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={e => { e.preventDefault(); setActiveTab("search"); }}>
          <span className="brand-mark"><Plane size={21} fill="currentColor" /></span>
          <span>sky<span className="brand-light">way</span><small>TRAVEL, MADE SIMPLE</small></span>
        </a>
        <button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu"><Menu /></button>
        <nav className={mobileMenu ? "nav-links nav-open" : "nav-links"}>
          <button className={activeTab === "search" ? "nav-link active" : "nav-link"} onClick={() => { setActiveTab("search"); setMobileMenu(false); }}>Book a flight</button>
          <button className={activeTab === "ticket" ? "nav-link active" : "nav-link"} onClick={() => { setActiveTab("ticket"); setMobileMenu(false); }}>My ticket</button>
          <button className={activeTab === "cancel" ? "nav-link active" : "nav-link"} onClick={() => { setActiveTab("cancel"); setMobileMenu(false); }}>Manage booking</button>
        </nav>
        <div className="topbar-right"><span className="secure-label"><ShieldCheck size={15} /> Secure booking</span><span className="avatar">S</span></div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-overlay"></div>
          <div className="hero-content">
            <div className="eyebrow"><span></span> YOUR NEXT JOURNEY STARTS HERE</div>
            <h1>The world is closer<br />than you <em>think.</em></h1>
            <p>Find your flight, choose your seat, and let the journey begin.</p>
            <div className="hero-perks">
              <span><ShieldCheck size={16} /> Simple booking</span>
              <span><Luggage size={16} /> Travel with ease</span>
              <span><CheckCircle2 size={16} /> Instant confirmation</span>
            </div>
          </div>
          <div className="hero-stamp"><Plane size={18} /><span>YOUR JOURNEY<br /><b>BEGINS HERE</b></span></div>
        </section>

        <section className="content-wrap">
          <div className="booking-panel">
            <div className="panel-tabs">
              <button className={activeTab === "search" ? "panel-tab selected" : "panel-tab"} onClick={() => setActiveTab("search")}><Plane size={17} /> Find flights</button>
              <button className={activeTab === "ticket" ? "panel-tab selected" : "panel-tab"} onClick={() => setActiveTab("ticket")}><Ticket size={17} /> Ticket details</button>
              <button className={activeTab === "cancel" ? "panel-tab selected" : "panel-tab"} onClick={() => setActiveTab("cancel")}><RefreshCw size={16} /> Cancel booking</button>
            </div>

            {notice && <div className={`notice ${notice.type}`}><span>{notice.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss"><XCircle size={17} /></button></div>}

            {activeTab === "search" && <>
              <div className="section-heading"><div><h2>Where would you like to go?</h2><p>Choose your route and discover available flights.</p></div><span className="step-label">STEP 01 <i> / 03</i></span></div>
              <div className="search-grid">
                <label className="field"><span><MapPin size={15} /> FROM</span><select value={originFilter} onChange={e => setOriginFilter(e.target.value)}><option value="">Any departure city</option>{airports.map(city => <option key={city}>{city}</option>)}</select></label>
                <button className="swap-btn" title="Swap route" onClick={() => { setOriginFilter(destinationFilter); setDestinationFilter(originFilter); }}><ArrowLeftRight size={18} /></button>
                <label className="field"><span><MapPin size={15} /> TO</span><select value={destinationFilter} onChange={e => setDestinationFilter(e.target.value)}><option value="">Any destination</option>{airports.map(city => <option key={city}>{city}</option>)}</select></label>
                <label className="field date-field"><span><CalendarDays size={15} /> TRAVEL DATE</span><input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} /></label>
                <button className="search-btn" onClick={() => { setSelectedFlight(null); setSelectedSeat(null); }}><Search size={18} /> Search flights</button>
              </div>
              <div className="flight-list-heading"><div><h3>Available flights</h3><span>{loadingFlights ? "Checking schedules…" : `${filteredFlights.length} flight${filteredFlights.length === 1 ? "" : "s"} found`}</span></div><button className="text-button" onClick={resetSearch}>Clear filters</button></div>

              {apiError && <div className="error-panel"><AlertCircle size={20} /><div><b>Unable to connect to the flight service</b><p>{apiError}</p><button className="retry-btn" onClick={loadFlights}><RefreshCw size={14} /> Try again</button></div></div>}
              {loadingFlights && <div className="loading-state"><LoaderCircle className="spin" size={28} /><span>Finding your flights…</span></div>}
              {!loadingFlights && !apiError && filteredFlights.length === 0 && <div className="empty-state"><Plane size={30} /><b>No flights match your search</b><span>Try another route or clear your filters.</span><button className="text-button" onClick={resetSearch}>Show all flights</button></div>}

              <div className="flight-list">
                {filteredFlights.map((flight, index) => (
                  <article className={`flight-card ${selectedFlight?.flightno === flight.flightno ? "flight-selected" : ""}`} key={`${flight.flightno}-${index}`}>
                    <div className="airline-symbol"><Plane size={21} /></div>
                    <div className="flight-main">
                      <div className="flight-number">{flight.flightno} <span className="flight-tag">DIRECT</span></div>
                      <div className="route-row">
                        <div><b>{flight.departure}</b><strong>{flight.origin}</strong><small>{prettyDate(flight.date)}</small></div>
                        <div className="route-line"><span></span><Plane size={15} /><span></span><small>Flight route</small></div>
                        <div className="route-destination"><b>{flight.arrival}</b><strong>{flight.destination}</strong><small>Arrival time</small></div>
                      </div>
                    </div>
                    <div className="flight-price"><span>PRICE FROM</span><b>{flight.min_price != null ? money(flight.min_price) : "—"}</b><small>{flight.max_price != null ? `Up to ${money(flight.max_price)}` : "Check seats"}</small></div>
                    <button className={selectedFlight?.flightno === flight.flightno ? "choose-btn chosen" : "choose-btn"} onClick={() => chooseFlight(flight)}>{selectedFlight?.flightno === flight.flightno ? "Selected" : "Choose flight"} <ChevronRight size={16} /></button>
                  </article>
                ))}
              </div>

              {selectedFlight && <section className="seat-section">
                <div className="section-heading seat-heading"><div><span className="step-kicker">STEP 02</span><h2>Choose your seat</h2><p>{selectedFlight.flightno} · {selectedFlight.origin} to {selectedFlight.destination}</p></div><span className="seat-legend"><i className="legend-dot available"></i> Available <i className="legend-dot unavailable"></i> Booked</span></div>
                {loadingSeats ? <div className="loading-state"><LoaderCircle className="spin" size={25} /><span>Loading seats…</span></div> : seatError ? <div className="inline-error">{seatError}</div> : <div className="seat-layout">
                  <div className="seat-map">
                    <div className="cockpit"><span></span><span></span></div>
                    <div className="seat-map-title"><Armchair size={16} /> SEAT MAP</div>
                    <div className="seats-grid">
                      {seats.map((seat, index) => {
                        const available = isAvailable(seat.is_available);
                        const selected = selectedSeat?.seatno === seat.seatno;
                        return <button key={`${seat.seatno}-${index}`} disabled={!available} className={`seat ${available ? "seat-available" : "seat-unavailable"} ${selected ? "seat-picked" : ""}`} onClick={() => setSelectedSeat(seat)} title={`${seat.seatno} · ${seat.class || "Seat"} · ${money(seat.price)}`}>{seat.seatno}</button>;
                      })}
                    </div>
                    <div className="seat-legend bottom-legend"><i className="legend-dot available"></i> Available <i className="legend-dot selected-dot"></i> Selected <i className="legend-dot unavailable"></i> Booked</div>
                  </div>
                  <form className="booking-summary" onSubmit={bookSeat}>
                    <div className="summary-label">YOUR SELECTION</div>
                    {selectedSeat ? <>
                      <div className="summary-seat"><div className="summary-seat-icon"><Armchair size={23} /></div><div><b>Seat {selectedSeat.seatno}</b><span>{selectedSeat.class || "Standard"} class</span></div></div>
                      <div className="summary-row"><span>Flight</span><b>{selectedFlight.flightno}</b></div>
                      <div className="summary-row"><span>Route</span><b>{selectedFlight.origin} → {selectedFlight.destination}</b></div>
                      <div className="summary-row"><span>Seat fare</span><b>{money(selectedSeat.price)}</b></div>
                    </> : <div className="select-seat-hint">Select an available seat from the seat map to see your fare.</div>}
                    <label className="passenger-field">Passenger ID <input required value={passengerId} onChange={e => setPassengerId(e.target.value)} placeholder="Enter your database passenger ID" inputMode="numeric" /></label>
                    <button className="confirm-btn" type="submit" disabled={busy || !selectedSeat || !passengerId.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />} Confirm booking</button>
                    <p className="fine-print"><ShieldCheck size={13} /> Booking is confirmed by the airline database.</p>
                  </form>
                </div>}
              </section>}
            </>}

            {activeTab === "ticket" && <section className="ticket-section">
              <div className="section-heading"><div><h2>Your ticket</h2><p>Your booking confirmation will appear here after a successful reservation.</p></div><span className="step-label">BOOKING <i> CONFIRMATION</i></span></div>
              {!ticketData ? <div className="empty-state ticket-empty"><Ticket size={34} /><b>No ticket to display yet</b><span>Book a flight first. Your ticket details will appear here.</span><button className="search-btn compact" onClick={() => setActiveTab("search")}>Find a flight <ChevronRight size={16} /></button></div> : <div className="ticket-card">
                <div className="ticket-top"><div className="ticket-brand"><span className="brand-mark"><Plane size={19} /></span><b>skyway</b></div><span className="confirmed"><CheckCircle2 size={15} /> BOOKING CONFIRMED</span></div>
                <div className="ticket-route"><div><span>FROM</span><h2>{ticketData.origin}</h2><b>{ticketData.departure}</b></div><div className="ticket-route-line"><Plane size={21} /><span></span></div><div className="ticket-dest"><span>TO</span><h2>{ticketData.destination}</h2><b>{ticketData.arrival}</b></div></div>
                <div className="ticket-details-grid"><div><span>PASSENGER</span><b>{ticketData.passenger_name || "—"}</b></div><div><span>FLIGHT</span><b>{ticketData.flight_no}</b></div><div><span>DATE</span><b>{prettyDate(ticketData.date)}</b></div><div><span>SEAT</span><b>{ticketData.seat_no} · {ticketData.seat_class || "—"}</b></div><div><span>EMAIL</span><b>{ticketData.email || "—"}</b></div><div><span>TOTAL PAID</span><b className="ticket-fare">{money(ticketData.price)}</b></div></div>
                <div className="ticket-crew"><b>Flight crew</b>{Array.isArray(ticketData.crew) && ticketData.crew.length ? ticketData.crew.map((crew, i) => <span key={i}>{crew.name} <small>{crew.role}</small></span>) : <span>Crew details unavailable</span>}</div>
                <div className="ticket-footer"><span><ShieldCheck size={15} /> Keep this confirmation for your records.</span><button onClick={() => window.print()} className="text-button">Print ticket</button></div>
                <button className="outline-danger" onClick={() => { setCancelPassengerId(String(passengerId)); setCancelFlightNo(String(ticketData.flight_no)); setCancelSeatNo(String(ticketData.seat_no)); setActiveTab("cancel"); }}>Manage or cancel this booking</button>
              </div>}
            </section>}

            {activeTab === "cancel" && <section className="cancel-section">
              <div className="section-heading"><div><h2>Manage your booking</h2><p>Enter the same passenger, flight and seat details used when booking.</p></div><span className="step-label">SELF SERVICE</span></div>
              <div className="cancel-layout">
                <form className="cancel-form" onSubmit={cancelBooking}>
                  <label className="field"><span>PASSENGER ID</span><input required value={cancelPassengerId} onChange={e => setCancelPassengerId(e.target.value)} placeholder="e.g. 1001" inputMode="numeric" /></label>
                  <label className="field"><span>FLIGHT NUMBER</span><input required value={cancelFlightNo} onChange={e => setCancelFlightNo(e.target.value)} placeholder="e.g. AI101" /></label>
                  <label className="field"><span>SEAT NUMBER</span><input required value={cancelSeatNo} onChange={e => setCancelSeatNo(e.target.value)} placeholder="e.g. 12A" /></label>
                  <button className="cancel-btn" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />} Cancel booking</button>
                  <p className="fine-print">Cancellation is permanent once accepted by the backend.</p>
                </form>
                <aside className="refund-card"><div className="refund-icon"><RefreshCw size={22} /></div><h3>Refund information</h3><p>Your backend applies a 10% cancellation fee to the paid seat price.</p><div className="refund-example"><span>Cancellation fee</span><b>10% of fare</b></div><div className="refund-example"><span>Refund amount</span><b>90% of fare</b></div><small>The actual amounts will be shown after a successful cancellation.</small></aside>
              </div>
              {cancelResult && <div className="refund-result"><div className="refund-success"><CheckCircle2 size={20} /><div><b>Booking cancelled</b><span>{cancelResult.message}</span></div></div><div className="refund-amounts"><div><span>Original fare</span><b>{money(cancelResult.paid_amount)}</b></div><div><span>Cancellation fee</span><b>{money(cancelResult.cancellation_fee)}</b></div><div><span>Your refund</span><b className="refund-total">{money(cancelResult.refund_amount)}</b></div></div></div>}
            </section>}
          </div>

          <div className="trust-row"><div><ShieldCheck size={19} /><span><b>Secure process</b><small>Connected to your booking API</small></span></div><div><Clock3 size={19} /><span><b>Quick confirmation</b><small>Live response from the backend</small></span></div><div><Users size={19} /><span><b>Passenger first</b><small>Your journey, your way</small></span></div></div>
        </section>
      </main>
      <footer className="footer"><a className="brand footer-brand" href="#"><span className="brand-mark"><Plane size={17} /></span><span>sky<span className="brand-light">way</span></span></a><span>Made for smoother journeys.</span><span>Airline Booking Management System</span></footer>
    </div>
  );
}
