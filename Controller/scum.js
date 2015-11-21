
module.exports = function (window) {

    /**     @property/Function Object.addPermanent
        Attaches a non-enumerable static property to an arbitrary Object. Usually used to attach
        nefarious extra methods to native prototypes. Be aware that every time you do this, a small part
        of your integrity is permenantly removed.
    @argument/Object target
        Recipient of the non-enumerable properties.
    @argument/String
    */
    function addPermanent (target, name, value) {
        try {
            Object.defineProperty (target, name, {
                'enumerable':       false,
                'configurable':     false,
                'writable':         true,
                'value':            value
            });
        } catch (err) {
            console.trace();
        }
        return target;
    };
    addPermanent (Object, 'addPermanent', addPermanent);

    /*      @member/Function window.Element#addClass
    Add a css classname to the class attribute.
    @name Element#addClass
    @function
    @param {String} classname A string representing the class. Assumed to be a
        single, valid class name.
    @returns {Element} self.
    */
    Object.addPermanent (window.Element.prototype, "addClass", function (classname) {
        var current = this.className.length ? this.className.split (' ') : [];
        if (current.indexOf (classname) >= 0) return this;
        current.push (classname);
        this.className = current.join (" ");
        return this;
    });


    /**
    Drop a css classname from the class attribute.
    @name Element#dropClass
    @function
    @param {String} classname A string representing the class. Assumed to be a
        single, valid class name.
    @returns {Element} self.
    */
    Object.addPermanent (window.Element.prototype, "dropClass", function (classname) {
        var current = this.className.length ? this.className.split (' ') : [];
        var i = current.indexOf (classname);
        if (i < 0) return this;
        current.splice (i, 1);
        this.className = current.join (" ");
        return this;
    });


    /**
    Test whether a given class has been set.
    @name Element#hasClass
    @function
    @param {String} classname The classname to search for.
    @returns {Boolean} Whether the classname exists on this Element.
    */
    Object.addPermanent (window.Element.prototype, "hasClass", function (classname) {
        var current = this.className.length ? this.className.split (' ') : [];
        return current.indexOf(classname) >= 0 ? true : false;
    });


    /**
    Set the exact list of css classes on an Element with an Array.
    @name Element#setClass
    @function
    @param {Array[String]} classname An array of css classes to be set on this Element.
    @returns {Element} self.
    */
    Object.addPermanent (window.Element.prototype, "setClass", function (classname) {
        if (!(classname instanceof Array))
            classname = Array.prototype.slice.call (arguments);
        this.className = classname.join (" ");
        return this;
    });

    /**     @property/Object Object.DROP_LISTENER
        This constant is used with event listeners. Throwing it during an event handler will efficiently
        dequeue the handler.
    */
    var DROP_LISTENER = {};
    Object.addPermanent (Object, 'DROP_LISTENER', DROP_LISTENER);


    function addEventListener (event, call) {
        var listeners;
        if (!this._listeners) {
            this._listeners = {};
            listeners = this._listeners[event] = [ call ];
        } else {
            if (Object.hasOwnProperty.call (this._listeners, event)) {
                this._listeners[event].push (call);
                // the event listener function was already created
                return this;
            }
            listeners = this._listeners[event] = [ call ];
        }

        // the listener chain for this event was empty until now
        // add a property to catch DOM events.
        // Instead of keeping up with all possible DOM events, just make props for all events.
        var elem = this;
        this["on"+event] = function(){
            var ok = true;
            for (var i=0, j=listeners.length; i<j; i++)
                try {
                    var activeListener = listeners[i];
                    if (activeListener.apply (elem, arguments) === false)
                        ok = false;
                } catch (err) {
                    if (err === Object.DROP_LISTENER) {
                        listeners.splice (i,1);
                        i--; j--;
                        continue;
                    }
                    console.log (err, err.stack);
                    throw err;
                }
            return ok;
        };

        return this;
    }


    /**     @Function Node#on
        Add an event listener to a DOM Element. Events are queued FIFO and lose their place in line
        when dropped. During any DOM event handler, throw [Object.DROP_LISTENER]() to efficiently drop
        the handler.
    @argument/String event
        The name of the event to listen for. If this is a DOM event, omit the initial "on".
    @argument/Function call
        The listener Function to add to the event's queue.
    @argument/Object thisarg
        @optional
        The listener is applied on `thisarg` instead of this Element.
    @returns Element
        Self.
    */
    Object.addPermanent (window.Node.prototype, "on", addEventListener);


    /**     @Function window#on
        Add an event listener to `window`. Events are queued FIFO and lose their place in line
        when dropped.
    @argument/String event
        The name of the event to listen for. If this is a DOM event, omit the initial "on".
    @argument/Function call
        The function to add to the event's queue.
    @argument/Object thisarg
        @optional
        The listener is applied on `thisarg` instead of this Element.
    @returns Element
        Self.
    */
    Object.addPermanent (window, "on", addEventListener);


    /**     @Function document#on
        Add an event listener to `window`. Events are queued FIFO and lose their place in line
        when dropped.
    @argument/String event
        The name of the event to listen for. If this is a DOM event, omit the initial "on".
    @argument/Function call
        The function to add to the event's queue.
    @argument/Object thisarg
        @optional
        The listener is applied on `thisarg` instead of this Element.
    @returns Element
        Self.
    */
    // Object.addPermanent (document, "on", addEventListener);


    /**     @Function Element#emit
        Call the registered `once` event handlers, asynchronously, in FIFO order. Then call normal
        event handlers, also in FIFO order. Any handler that throws
        [DROP_LISTENER](type://element.DROP_LISTENER) is summarily dropped.
    */
    Object.addPermanent (window.Element.prototype, "emit", function () {
        if (!this._listeners) return this;
        if (!Object.hasOwnProperty.call (this._listeners, arguments[0]))
            return this;
        var listeners = this._listeners[arguments[0]];

        var args = [];Array.prototype.slice.call (arguments, 1);
        for (var i=1, j=arguments.length; i<j; i++)
            args.push (arguments[i]);

        for (var i=0,j=listeners.length; i<j; i++)
            listeners[i].apply (listeners[i]._this, args);
    });


    /**     @Function Element#dropListener
        Drop an event listener from this DOM Element.
    @argument/String event
        The name of the event not to listen to anymore, without the "on".
    @argument/Function call
        A reference to the callback we're to remove from the queue.
    @returns Element
        self.
    */
    Object.addPermanent (window.Element.prototype, "dropListener", function (event, call) {
        if (!this._listeners) return this;

        if (!Object.hasOwnProperty.call (this._listeners, event))
            return this;
        var calls = this._listeners[event];
        for (var i=0,j=calls.length; i<j; i++)
            if (calls[i] === call) {
                calls.splice (i, 1);
                i--; j--;
            }
        return this;
    });


    /**     @Function Element#dropEvent
    Drop all listeners on a given DOM event.
    @argument/String event
        The name of the event to nuke.
    @returns Element
        Self.
    */
    Object.addPermanent (window.Element.prototype, "dropEvent", function (event) {
        if (!this._listeners) return this;
        delete this._listeners[event];
        this["on"+event] = null;
        return this;
    });


    /**     @Function Element#dropAllEvents
        Drop all listeners on all DOM events on this Element.
    @returns Element
        Self.
    */
    Object.addPermanent (window.Element.prototype, "dropAllEvents", function (event) {
        if (!this._listeners) return this;
        for (var key in this._listeners)
            this["on"+key] = null;
        delete this._listeners;
        return this;
    });

    var OPTIMIZE_APPEND_DOC_FRAG = 3;

    /**     @Function Node#replace
        Remove this Node from the DOM and replace it with any number of other Nodes.
    */
    Object.addPermanent (window.Node.prototype, "replace", function (contents) {
        var contentsType = Object.typeStr (contents);
        if (contentsType != 'array' && contentsType != 'nodelist')
            contents = arguments;

        if (!contents.length)
            return this;
        if (contents.length == 1) {
            if (contents[0] !== this) {
                this.parentNode.insertBefore (contents[0], this);
                this.parentNode.removeChild (this);
            }
            return this;
        }

        var anchor = contents[contents.length-1];
        this.parentNode.insertBefore (anchor, this);
        if (anchor !== this)
            this.parentNode.removeChild (this);

        if (contents.length > OPTIMIZE_APPEND_DOC_FRAG) {
            var frag = window.document.createDocumentFragment();
            for (var i=0,j=contents.length-1; i<j; i++)
                frag.appendChild (contents[i]);
            parent.insertBefore (frag, anchor);
            return this;
        }

        for (var i=contents.length-1; i>=0; i--)
            this.parentNode.insertBefore (contents[i], anchor);
        return this;
    });


    /**     @member/Function Node#dispose
        Remove this Node or Element from the DOM. Just a little more elegant than calling
        `elem.parentNode.removeChild (elem);`.
    @returns/Node
        Self.
    */
    Object.addPermanent (window.Node.prototype, "dispose", function(){
        if (this.parentNode) this.parentNode.removeChild (this);
        return this;
    });


    /**     @member/Function Element#disposeChildren
        @synonym Element#dropChildren
        Convenience method to call `dispose` on all child nodes.
    @returns/Element
        Self.
    */
    Object.addPermanent (window.Element.prototype, "disposeChildren", function(){
        while (this.firstChild)
            this.removeChild (this.firstChild);
        return this;
    });
    Object.addPermanent (
        window.Element.prototype,
        "dropChildren",
        window.Element.prototype.disposeChildren
    );


    /**     @member/Function Node#appendText
        Append a text to this Node with the provided content. When called on an Element, the last Node
        is used, if it is a textual Node, or a new Text Node will be created and appended.
    @argument/String text
        Text content to append.
    @returns Node
        The Text Node containing the appended content.
    */
    Object.addPermanent (window.Node.prototype, "appendText", function (text) {
        this.textContent = this.textContent + text;
        return this;
    });
    Object.addPermanent (window.Element.prototype, "appendText", function (text) {
        if (Object.typeStr(this.lastChild) == 'textnode') {
            this.lastChild.textContent = this.lastChild.textContent + text;
            return this;
        }
        var newNode = window.document.createTextNode (text);
        this.appendChild (newNode);
        return this;
    });


    /**     @member/Function Element#append
        Synonym for native `appendChild`, except it accepts any number of Node arguments, or an Array
        of Nodes.
    @argument/Array contents
        @optional
        An Array of Nodes to append to this Element. Mutually exclusive with the `newChild` argument(s).
    @argument/Node newChild
        @optional
        Any number of Nodes to append to this Element. Mutually exclusive with the `contents` argument.
    @returns/Element
        Self.
    */
    Object.addPermanent (window.Element.prototype, "append", function (contents) {
        if (!contents) // called without args, append nothing
            return this;

        var contentsType = Object.typeStr (contents);
        if (contentsType != 'array' && contentsType != 'nodelist')
            contents = Array.prototype.slice.call (arguments);

        if (contents.length > OPTIMIZE_APPEND_DOC_FRAG) {
            var frag = window.document.createDocumentFragment();
            for (var i=0,j=contents.length; i<j; i++)
                frag.appendChild (contents[i]);
            this.appendChild (frag);
            return this;
        }

        for (var i=0,j=contents.length; i<j; i++)
            this.appendChild (contents[i]);
        return this;
    });


    /**     @member/Function Element#prepend
        Insert any number of Nodes as the first child(ren) of this Element.
    @argument/Array contents
        @optional
        An Array of Nodes to prepend to this Element. Mutually exclusive with the `newChild`
        argument(s).
    @argument/Node newChild
        @optional
        Any number of Nodes to prepend to this Element. Mutually exclusive with the `contents`
        argument.
    @returns/Element
        Self.
    */
    Object.addPermanent (window.Element.prototype, "prepend", function (contents) {
        if (!contents) // called without args, append nothing
            return this;

        var contentsType = Object.typeStr (contents);
        if (contentsType != 'array' && contentsType != 'nodelist')
            contents = Array.prototype.slice.call (arguments);

        if (contents.length > OPTIMIZE_APPEND_DOC_FRAG) {
            var frag = window.document.createDocumentFragment();
            for (var i=0,j=contents.length; i<j; i++)
                frag.appendChild (contents[i]);
            if (this.firstChild)
                this.insertBefore (frag, this.firstChild);
            else
                this.appendChild (frag);
            return this;
        }

        var sucker = this.firstChild;
        if (sucker)
            for (var i=0,j=contents.length; i<j; i++)
                this.insertBefore (contents[i], sucker);
        else
            for (var i=0,j=contents.length; i<j; i++)
                this.appendChild (contents[i]);

        return this;
    });


    /**     @member/Function Element#preFix
        Insert any number of Nodes directly before this Element. An Error will be thrown if this
        Element has no parent - but it doesn't have to be in the page yet.
    @argument/Array contents
        @optional
        An Array of Nodes to prefix to this Element. Mutually exclusive with the `newSib` argument(s).
    @argument/Node newSib
        @optional
        Any number of Nodes to prefix to this Element. Mutually exclusive with the `contents` argument.
    @returns/Element
        Self.
    */
    Object.addPermanent (window.Element.prototype, "preFix", function (contents) {
        var parent = this.parentNode;
        if (!parent)
            throw new Error ("cannot preFix Nodes on Element with no parent.");
        if (!contents) // called without args, append nothing
            return this;

        var contentsType = Object.typeStr (contents);
        if (contentsType != 'array' && contentsType != 'nodelist')
            contents = arguments;

        if (contents.length > OPTIMIZE_APPEND_DOC_FRAG) {
            var frag = window.document.createDocumentFragment();
            for (var i=0,j=contents.length; i<j; i++)
                frag.appendChild (contents[i]);
            parent.insertBefore (frag, this);
            return this;
        }

        for (var i=0,j=contents.length; i<j; i++)
            parent.insertBefore (contents[i], this);
        return this;
    });


    /**     @member/Function Element#postFix
        Insert any number of Nodes directly after this Element. An Error will be thrown if this
        Element has no parent - but it doesn't have to be in the page yet.
    @argument/Array contents
        @optional
        An Array of Nodes to postfix to this Element. Mutually exclusive with the `newSib` argument(s).
    @argument/Node newSib
        @optional
        Any number of Nodes to postfix to this Element. Mutually exclusive with the `contents` argument.
    @returns/Element
        Self.
    */
    Object.addPermanent (window.Element.prototype, "postFix", function (contents) {
        var parent = this.parentNode;
        if (!parent)
            throw new Error ("cannot postFix Nodes on Element with no parent.");
        if (!contents) // called without args, append nothing
            return this;

        var contentsType = Object.typeStr (contents);
        if (contentsType != 'array' && contentsType != 'nodelist')
            contents = arguments;

        var sib = this.nextSibling;

        if (contents.length > OPTIMIZE_APPEND_DOC_FRAG) {
            var frag = window.document.createDocumentFragment();
            for (var i in contents)
                frag.appendChild (contents[i]);
            if (sib)
                parent.insertBefore (frag, sib);
            else
                parent.appendChild (frag);
            return this;
        }

        if (sib)
            for (var i=0,j=contents.length; i<j; i++)
                parent.insertBefore (contents[i], sib);
        else
            for (var i=0,j=contents.length; i<j; i++)
                parent.appendChild (contents[i]);
        return this;
    });


    /**     @member/Function Element#elemIndexOf
        Search for an Element among this Element's children, counting only Element children. Returns
        `-1` if not found.
    @argument/Element item
        Element to search for among Element children.
    */
    Object.addPermanent (window.Element.prototype, "elemIndexOf", function (item) {
        for (var i=0,j=this.children.length; i<j; i++)
            if (item === this.children[i]) return i;
        return -1;
    });


    /**     @member/Function Element#nodeIndexOf
        Search for a Node among this Element's children, counting all child Nodes. Returns `-1` if not
        found.
    @argument/Node item
        Node to search for among all children.
    */
    Object.addPermanent (window.Element.prototype, "nodeIndexOf", function (item) {
        for (var i=0,j=this.childNodes.length; i<j; i++)
            if (item === this.childNodes[i]) return i;
        return -1;
    });


    /**     @member/Function Node#setText

    */
    Object.addPermanent (window.Node.prototype, "setText", function (text) {
        this.textContent = text;
        return this;
    });
    Object.addPermanent (window.Element.prototype, "setText", function (text) {
        while (this.firstChild)
            this.removeChild (this.firstChild);
        this.appendChild (window.document.createTextNode (text));
        return this;
    });
};
